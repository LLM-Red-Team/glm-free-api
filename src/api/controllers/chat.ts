import { PassThrough } from "stream";
import path from "path";
import _ from "lodash";
import mime from "mime";
import sharp from "sharp";
import fs from "fs-extra";
import FormData from "form-data";
import axios, { AxiosResponse } from "axios";

import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";
import { createParser } from "eventsource-parser";
import logger from "@/lib/logger.ts";
import util from "@/lib/util.ts";

// 模型名称
const MODEL_NAME = "glm";
// 默认的智能体ID，GLM4
const DEFAULT_ASSISTANT_ID = "65940acff94777010aa6b796";
// access_token有效期
const ACCESS_TOKEN_EXPIRES = 3600;
// 最大重试次数
const MAX_RETRY_COUNT = 3;
// 重试延迟
const RETRY_DELAY = 5000;
// 伪装headers
const FAKE_HEADERS = {
  Accept: "*/*",
  "App-Name": "chatglm",
  Platform: "pc",
  Origin: "https://chatglm.cn",
  "Sec-Ch-Ua":
    '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Version: "0.0.1",
};
// 文件最大大小
const FILE_MAX_SIZE = 100 * 1024 * 1024;
// access_token映射
const accessTokenMap = new Map();
// access_token请求队列映射
const accessTokenRequestQueueMap: Record<string, Function[]> = {};

/**
 * 请求access_token
 *
 * 使用refresh_token去刷新获得access_token
 *
 * @param refreshToken 用于刷新access_token的refresh_token
 */
async function requestToken(refreshToken: string) {
  if (accessTokenRequestQueueMap[refreshToken])
    return new Promise((resolve) =>
      accessTokenRequestQueueMap[refreshToken].push(resolve)
    );
  accessTokenRequestQueueMap[refreshToken] = [];
  logger.info(`Refresh token: ${refreshToken}`);
  const result = await (async () => {
    const result = await axios.post(
      "https://chatglm.cn/chatglm/backend-api/v1/user/refresh",
      {},
      {
        headers: {
          Authorization: `Bearer ${refreshToken}`,
          Referer: "https://chatglm.cn/main/alltoolsdetail",
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          ...FAKE_HEADERS,
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    const { result: _result } = checkResult(result, refreshToken);
    const { accessToken } = _result;
    return {
      accessToken,
      refreshToken,
      refreshTime: util.unixTimestamp() + ACCESS_TOKEN_EXPIRES,
    };
  })()
    .then((result) => {
      if (accessTokenRequestQueueMap[refreshToken]) {
        accessTokenRequestQueueMap[refreshToken].forEach((resolve) =>
          resolve(result)
        );
        delete accessTokenRequestQueueMap[refreshToken];
      }
      logger.success(`Refresh successful`);
      return result;
    })
    .catch((err) => {
      if (accessTokenRequestQueueMap[refreshToken]) {
        accessTokenRequestQueueMap[refreshToken].forEach((resolve) =>
          resolve(err)
        );
        delete accessTokenRequestQueueMap[refreshToken];
      }
      return err;
    });
  if (_.isError(result)) throw result;
  return result;
}

/**
 * 获取缓存中的access_token
 *
 * 避免短时间大量刷新token，未加锁，如果有并发要求还需加锁
 *
 * @param refreshToken 用于刷新access_token的refresh_token
 */
async function acquireToken(refreshToken: string): Promise<string> {
  let result = accessTokenMap.get(refreshToken);
  if (!result) {
    result = await requestToken(refreshToken);
    accessTokenMap.set(refreshToken, result);
  }
  if (util.unixTimestamp() > result.refreshTime) {
    result = await requestToken(refreshToken);
    accessTokenMap.set(refreshToken, result);
  }
  return result.accessToken;
}

/**
 * 移除会话
 *
 * 在对话流传输完毕后移除会话，避免创建的会话出现在用户的对话列表中
 *
 * @param refreshToken 用于刷新access_token的refresh_token
 */
async function removeConversation(
  convId: string,
  refreshToken: string,
  assistantId = DEFAULT_ASSISTANT_ID
) {
  const token = await acquireToken(refreshToken);

  const result = await axios.post(
    "https://chatglm.cn/chatglm/backend-api/assistant/conversation/delete",
    {
      assistant_id: assistantId,
      conversation_id: convId,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Referer: `https://chatglm.cn/main/alltoolsdetail`,
        "X-Device-Id": util.uuid(false),
        "X-Request-Id": util.uuid(false),
        ...FAKE_HEADERS,
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  checkResult(result, refreshToken);
}

/**
 * 同步对话补全
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param refreshToken 用于刷新access_token的refresh_token
 * @param assistantId 智能体ID，默认使用GLM4原版
 * @param retryCount 重试次数
 */
async function createCompletion(
  messages: any[],
  refreshToken: string,
  assistantId = DEFAULT_ASSISTANT_ID,
  refConvId = "",
  retryCount = 0
) {
  return (async () => {
    logger.info(messages);

    // 提取引用文件URL并上传获得引用的文件ID列表
    const refFileUrls = extractRefFileUrls(messages);
    const refs = refFileUrls.length
      ? await Promise.all(
          refFileUrls.map((fileUrl) => uploadFile(fileUrl, refreshToken))
        )
      : [];

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-zA-Z]{24}/.test(refConvId)) refConvId = "";

    // 请求流
    const token = await acquireToken(refreshToken);
    const result = await axios.post(
      "https://chatglm.cn/chatglm/backend-api/assistant/stream",
      {
        assistant_id: assistantId,
        conversation_id: refConvId,
        messages: messagesPrepare(messages, refs, !!refConvId),
        meta_data: {
          channel: "",
          draft_id: "",
          input_question_type: "xxxx",
          is_test: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer:
            assistantId == DEFAULT_ASSISTANT_ID
              ? "https://chatglm.cn/main/alltoolsdetail"
              : `https://chatglm.cn/main/gdetail/${assistantId}`,
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          ...FAKE_HEADERS,
        },
        // 120秒超时
        timeout: 120000,
        validateStatus: () => true,
        responseType: "stream",
      }
    );
    if (result.headers["content-type"].indexOf("text/event-stream") == -1) {
      result.data.on("data", (buffer) => logger.error(buffer.toString()));
      throw new APIException(
        EX.API_REQUEST_FAILED,
        `Stream response Content-Type invalid: ${result.headers["content-type"]}`
      );
    }

    const streamStartTime = util.timestamp();
    // 接收流为输出文本
    const answer = await receiveStream(result.data);
    logger.success(
      `Stream has completed transfer ${util.timestamp() - streamStartTime}ms`
    );

    // 异步移除会话
    removeConversation(answer.id, refreshToken, assistantId).catch(
      (err) => !refConvId && console.error(err)
    );

    return answer;
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Stream response error: ${err.stack}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return createCompletion(
          messages,
          refreshToken,
          assistantId,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

/**
 * 流式对话补全
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param refreshToken 用于刷新access_token的refresh_token
 * @param assistantId 智能体ID，默认使用GLM4原版
 * @param retryCount 重试次数
 */
async function createCompletionStream(
  messages: any[],
  refreshToken: string,
  assistantId = DEFAULT_ASSISTANT_ID,
  refConvId = "",
  retryCount = 0
) {
  return (async () => {
    logger.info(messages);

    // 提取引用文件URL并上传获得引用的文件ID列表
    const refFileUrls = extractRefFileUrls(messages);
    const refs = refFileUrls.length
      ? await Promise.all(
          refFileUrls.map((fileUrl) => uploadFile(fileUrl, refreshToken))
        )
      : [];

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-zA-Z]{24}/.test(refConvId)) refConvId = "";

    // 请求流
    const token = await acquireToken(refreshToken);
    const result = await axios.post(
      `https://chatglm.cn/chatglm/backend-api/assistant/stream`,
      {
        assistant_id: assistantId,
        conversation_id: refConvId,
        messages: messagesPrepare(messages, refs, !!refConvId),
        meta_data: {
          channel: "",
          draft_id: "",
          input_question_type: "xxxx",
          is_test: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer:
            assistantId == DEFAULT_ASSISTANT_ID
              ? "https://chatglm.cn/main/alltoolsdetail"
              : `https://chatglm.cn/main/gdetail/${assistantId}`,
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          ...FAKE_HEADERS,
        },
        // 120秒超时
        timeout: 120000,
        validateStatus: () => true,
        responseType: "stream",
      }
    );

    if (result.headers["content-type"].indexOf("text/event-stream") == -1) {
      logger.error(
        `Invalid response Content-Type:`,
        result.headers["content-type"]
      );
      result.data.on("data", (buffer) => logger.error(buffer.toString()));
      const transStream = new PassThrough();
      transStream.end(
        `data: ${JSON.stringify({
          id: "",
          model: MODEL_NAME,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "服务暂时不可用，第三方响应错误",
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          created: util.unixTimestamp(),
        })}\n\n`
      );
      return transStream;
    }

    const streamStartTime = util.timestamp();
    // 创建转换流将消息格式转换为gpt兼容格式
    return createTransStream(result.data, (convId: string) => {
      logger.success(
        `Stream has completed transfer ${util.timestamp() - streamStartTime}ms`
      );
      // 流传输结束后异步移除会话
      removeConversation(convId, refreshToken, assistantId).catch(
        (err) => !refConvId && console.error(err)
      );
    });
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Stream response error: ${err.stack}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return createCompletionStream(
          messages,
          refreshToken,
          assistantId,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

async function generateImages(
  model = "65a232c082ff90a2ad2f15e2",
  prompt: string,
  refreshToken: string,
  retryCount = 0
) {
  return (async () => {
    logger.info(prompt);
    const messages = [
      {
        role: "user",
        content: prompt.indexOf("画") == -1 ? `请画：${prompt}` : prompt,
      },
    ];
    // 请求流
    const token = await acquireToken(refreshToken);
    const result = await axios.post(
      "https://chatglm.cn/chatglm/backend-api/assistant/stream",
      {
        assistant_id: model,
        conversation_id: "",
        messages: messagesPrepare(messages, []),
        meta_data: {
          channel: "",
          draft_id: "",
          input_question_type: "xxxx",
          is_test: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer: `https://chatglm.cn/main/gdetail/${model}`,
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          ...FAKE_HEADERS,
        },
        // 120秒超时
        timeout: 120000,
        validateStatus: () => true,
        responseType: "stream",
      }
    );

    if (result.headers["content-type"].indexOf("text/event-stream") == -1)
      throw new APIException(
        EX.API_REQUEST_FAILED,
        `Stream response Content-Type invalid: ${result.headers["content-type"]}`
      );

    const streamStartTime = util.timestamp();
    // 接收流为输出文本
    const { convId, imageUrls } = await receiveImages(result.data);
    logger.success(
      `Stream has completed transfer ${util.timestamp() - streamStartTime}ms`
    );

    // 异步移除会话，如果消息不合规，此操作可能会抛出数据库错误异常，请忽略
    removeConversation(convId, refreshToken, model).catch((err) =>
      console.error(err)
    );

    if (imageUrls.length == 0)
      throw new APIException(EX.API_IMAGE_GENERATION_FAILED);

    return imageUrls;
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Stream response error: ${err.message}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return generateImages(model, prompt, refreshToken, retryCount + 1);
      })();
    }
    throw err;
  });
}

async function generateVideos(
  model = "cogvideox",
  prompt: string,
  refreshToken: string,
  options: {
    imageUrl: string;
    videoStyle: string;
    emotionalAtmosphere: string;
    mirrorMode: string;
    audioId: string;
  },
  refConvId = "",
  retryCount = 0
) {
  return (async () => {
    logger.info(prompt);

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-zA-Z]{24}/.test(refConvId)) refConvId = "";

    const sourceList = [];
    if (model == "cogvideox-pro") {
      const imageUrls = await generateImages(undefined, prompt, refreshToken);
      options.imageUrl = imageUrls[0];
    }
    if (options.imageUrl) {
      const { source_id: sourceId } = await uploadFile(
        options.imageUrl,
        refreshToken,
        true
      );
      sourceList.push(sourceId);
    }

    // 发起生成请求
    let token = await acquireToken(refreshToken);
    const result = await axios.post(
      `https://chatglm.cn/chatglm/video-api/v1/chat`,
      {
        conversation_id: refConvId,
        prompt,
        source_list: sourceList.length > 0 ? sourceList : undefined,
        advanced_parameter_extra: {
          emotional_atmosphere: options.emotionalAtmosphere,
          mirror_mode: options.mirrorMode,
          video_style: options.videoStyle,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer: "https://chatglm.cn/video",
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          ...FAKE_HEADERS,
        },
        // 30秒超时
        timeout: 30000,
        validateStatus: () => true,
      }
    );
    const { result: _result } = checkResult(result, refreshToken);
    const { chat_id: chatId, conversation_id: convId } = _result;

    // 轮询生成进度
    const startTime = util.unixTimestamp();
    const results = [];
    while (true) {
      if (util.unixTimestamp() - startTime > 600)
        throw new APIException(EX.API_VIDEO_GENERATION_FAILED);
      const token = await acquireToken(refreshToken);
      const result = await axios.get(
        `https://chatglm.cn/chatglm/video-api/v1/chat/status/${chatId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Referer: "https://chatglm.cn/video",
            "X-Device-Id": util.uuid(false),
            "X-Request-Id": util.uuid(false),
            ...FAKE_HEADERS,
          },
          // 30秒超时
          timeout: 30000,
          validateStatus: () => true,
        }
      );
      const { result: _result } = checkResult(result, refreshToken);
      const {
        status,
        msg,
        plan,
        cover_url,
        video_url,
        video_duration,
        resolution,
      } = _result;
      if (status != "init" && status != "processing") {
        if (status != "finished")
          throw new APIException(EX.API_VIDEO_GENERATION_FAILED);
        let videoUrl = video_url;
        if (options.audioId) {
          const [key, id] = options.audioId.split("-");
          const token = await acquireToken(refreshToken);
          const result = await axios.post(
            `https://chatglm.cn/chatglm/video-api/v1/static/composite_video`,
            {
              chat_id: chatId,
              key,
              audio_id: id,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Referer: "https://chatglm.cn/video",
                "X-Device-Id": util.uuid(false),
                "X-Request-Id": util.uuid(false),
                ...FAKE_HEADERS,
              },
              // 30秒超时
              timeout: 30000,
              validateStatus: () => true,
            }
          );
          const { result: _result } = checkResult(result, refreshToken);
          videoUrl = _result.url;
        }
        results.push({
          conversation_id: convId,
          cover_url,
          video_url: videoUrl,
          video_duration,
          resolution,
        });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    //https://chatglm.cn/chatglm/video-api/v1/reference/audio_group

    axios
      .delete(`https://chatglm.cn/chatglm/video-api/v1/chat/${chatId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Referer: "https://chatglm.cn/video",
          "X-Device-Id": util.uuid(false),
          "X-Request-Id": util.uuid(false),
          ...FAKE_HEADERS,
        },
        validateStatus: () => true,
      })
      .catch((err) => logger.error("移除视频生成记录失败：", err));

    return results;
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Video generation error: ${err.message}`);
      logger.warn(`Try again after ${RETRY_DELAY / 1000}s...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return generateVideos(
          model,
          prompt,
          refreshToken,
          options,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

/**
 * 提取消息中引用的文件URL
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 */
function extractRefFileUrls(messages: any[]) {
  const urls = [];
  // 如果没有消息，则返回[]
  if (!messages.length) {
    return urls;
  }
  // 只获取最新的消息
  const lastMessage = messages[messages.length - 1];
  if (_.isArray(lastMessage.content)) {
    lastMessage.content.forEach((v) => {
      if (!_.isObject(v) || !["file", "image_url"].includes(v["type"])) return;
      // glm-free-api支持格式
      if (
        v["type"] == "file" &&
        _.isObject(v["file_url"]) &&
        _.isString(v["file_url"]["url"])
      )
        urls.push(v["file_url"]["url"]);
      // 兼容gpt-4-vision-preview API格式
      else if (
        v["type"] == "image_url" &&
        _.isObject(v["image_url"]) &&
        _.isString(v["image_url"]["url"])
      )
        urls.push(v["image_url"]["url"]);
    });
  }
  logger.info("本次请求上传：" + urls.length + "个文件");
  return urls;
}

/**
 * 消息预处理
 *
 * 由于接口只取第一条消息，此处会将多条消息合并为一条，实现多轮对话效果
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param refs 参考文件列表
 * @param isRefConv 是否为引用会话
 */
function messagesPrepare(messages: any[], refs: any[], isRefConv = false) {
  let content;
  if (isRefConv || messages.length < 2) {
    content = messages.reduce((content, message) => {
      if (_.isArray(message.content)) {
        return message.content.reduce((_content, v) => {
          if (!_.isObject(v) || v["type"] != "text") return _content;
          return _content + (v["text"] || "") + "\n";
        }, content);
      }
      return content + `${message.content}\n`;
    }, "");
    logger.info("\n透传内容：\n" + content);
  } else {
    // 检查最新消息是否含有"type": "image_url"或"type": "file",如果有则注入消息
    let latestMessage = messages[messages.length - 1];
    let hasFileOrImage =
      Array.isArray(latestMessage.content) &&
      latestMessage.content.some(
        (v) =>
          typeof v === "object" && ["file", "image_url"].includes(v["type"])
      );
    if (hasFileOrImage) {
      let newFileMessage = {
        content: "关注用户最新发送文件和消息",
        role: "system",
      };
      messages.splice(messages.length - 1, 0, newFileMessage);
      logger.info("注入提升尾部文件注意力system prompt");
    } else {
      // 由于注入会导致设定污染，暂时注释
      // let newTextMessage = {
      //   content: "关注用户最新的消息",
      //   role: "system",
      // };
      // messages.splice(messages.length - 1, 0, newTextMessage);
      // logger.info("注入提升尾部消息注意力system prompt");
    }
    content = (
      messages.reduce((content, message) => {
        const role = message.role
          .replace("system", "<|sytstem|>")
          .replace("assistant", "<|assistant|>")
          .replace("user", "<|user|>");
        if (_.isArray(message.content)) {
          return message.content.reduce((_content, v) => {
            if (!_.isObject(v) || v["type"] != "text") return _content;
            return _content + (`${role}\n` + v["text"] || "") + "\n";
          }, content);
        }
        return (content += `${role}\n${message.content}\n`);
      }, "") + "<|assistant|>\n"
    )
      // 移除MD图像URL避免幻觉
      .replace(/\!\[.+\]\(.+\)/g, "")
      // 移除临时路径避免在新会话引发幻觉
      .replace(/\/mnt\/data\/.+/g, "");
    logger.info("\n对话合并：\n" + content);
  }

  const fileRefs = refs.filter((ref) => !ref.width && !ref.height);
  const imageRefs = refs
    .filter((ref) => ref.width || ref.height)
    .map((ref) => {
      ref.image_url = ref.file_url;
      return ref;
    });
  return [
    {
      role: "user",
      content: [
        { type: "text", text: content },
        ...(fileRefs.length == 0
          ? []
          : [
              {
                type: "file",
                file: fileRefs,
              },
            ]),
        ...(imageRefs.length == 0
          ? []
          : [
              {
                type: "image",
                image: imageRefs,
              },
            ]),
      ],
    },
  ];
}

/**
 * 预检查文件URL有效性
 *
 * @param fileUrl 文件URL
 */
async function checkFileUrl(fileUrl: string) {
  if (util.isBASE64Data(fileUrl)) return;
  const result = await axios.head(fileUrl, {
    timeout: 15000,
    validateStatus: () => true,
  });
  if (result.status >= 400)
    throw new APIException(
      EX.API_FILE_URL_INVALID,
      `File ${fileUrl} is not valid: [${result.status}] ${result.statusText}`
    );
  // 检查文件大小
  if (result.headers && result.headers["content-length"]) {
    const fileSize = parseInt(result.headers["content-length"], 10);
    if (fileSize > FILE_MAX_SIZE)
      throw new APIException(
        EX.API_FILE_EXECEEDS_SIZE,
        `File ${fileUrl} is not valid`
      );
  }
}

/**
 * 上传文件
 *
 * @param fileUrl 文件URL
 * @param refreshToken 用于刷新access_token的refresh_token
 * @param isVideoImage 是否是用于视频图像
 */
async function uploadFile(
  fileUrl: string,
  refreshToken: string,
  isVideoImage: boolean = false
) {
  // 预检查远程文件URL可用性
  await checkFileUrl(fileUrl);

  let filename, fileData, mimeType;
  // 如果是BASE64数据则直接转换为Buffer
  if (util.isBASE64Data(fileUrl)) {
    mimeType = util.extractBASE64DataFormat(fileUrl);
    const ext = mime.getExtension(mimeType);
    filename = `${util.uuid()}.${ext}`;
    fileData = Buffer.from(util.removeBASE64DataHeader(fileUrl), "base64");
  }
  // 下载文件到内存，如果您的服务器内存很小，建议考虑改造为流直传到下一个接口上，避免停留占用内存
  else {
    filename = path.basename(fileUrl);
    ({ data: fileData } = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      // 100M限制
      maxContentLength: FILE_MAX_SIZE,
      // 60秒超时
      timeout: 60000,
    }));
  }

  // 获取文件的MIME类型
  mimeType = mimeType || mime.getType(filename);

  if (isVideoImage) {
    const im = sharp(fileData).resize(1440, null, {
      fit: "inside", // 保持宽高比
    });
    const metadata = await im.metadata();
    const cropHeight = metadata.height > 960 ? 960 : metadata.height;
    fileData = await im
      .extract({
        width: 1440,
        height: cropHeight,
        left: 0,
        top: (metadata.height - cropHeight) / 2,
      })
      .toBuffer();
  }

  const formData = new FormData();
  formData.append("file", fileData, {
    filename,
    contentType: mimeType,
  });

  // 上传文件到目标OSS
  const token = await acquireToken(refreshToken);
  let result = await axios.request({
    method: "POST",
    url: isVideoImage
      ? "https://chatglm.cn/chatglm/video-api/v1/static/upload"
      : "https://chatglm.cn/chatglm/backend-api/assistant/file_upload",
    data: formData,
    // 100M限制
    maxBodyLength: FILE_MAX_SIZE,
    // 60秒超时
    timeout: 60000,
    headers: {
      Authorization: `Bearer ${token}`,
      Referer: isVideoImage
        ? "https://chatglm.cn/video"
        : "https://chatglm.cn/",
      ...FAKE_HEADERS,
      ...formData.getHeaders(),
    },
    validateStatus: () => true,
  });
  const { result: uploadResult } = checkResult(result, refreshToken);

  return uploadResult;
}

/**
 * 检查请求结果
 *
 * @param result 结果
 */
function checkResult(result: AxiosResponse, refreshToken: string) {
  if (!result.data) return null;
  const { code, status, message } = result.data;
  if (!_.isFinite(code) && !_.isFinite(status)) return result.data;
  if (code === 0 || status === 0) return result.data;
  if (code == 401) accessTokenMap.delete(refreshToken);
  throw new APIException(EX.API_REQUEST_FAILED, `[请求glm失败]: ${message}`);
}

/**
 * 从流接收完整的消息内容
 *
 * @param stream 消息流
 */
async function receiveStream(stream: any): Promise<any> {
  return new Promise((resolve, reject) => {
    // 消息初始化
    const data = {
      id: "",
      model: MODEL_NAME,
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      created: util.unixTimestamp(),
    };
    let toolCall = false;
    let codeGenerating = false;
    let textChunkLength = 0;
    let codeTemp = "";
    let lastExecutionOutput = "";
    let textOffset = 0;
    let refContent = "";
    const parser = createParser((event) => {
      try {
        if (event.type !== "event") return;
        // 解析JSON
        const result = _.attempt(() => JSON.parse(event.data));
        if (_.isError(result))
          throw new Error(`Stream response invalid: ${event.data}`);
        if (!data.id && result.conversation_id)
          data.id = result.conversation_id;
        if (result.status != "finish") {
          const text = result.parts.reduce((str, part) => {
            const { status, content, meta_data } = part;
            if (!_.isArray(content)) return str;
            const partText = content.reduce((innerStr, value) => {
              const {
                status: partStatus,
                type,
                text,
                image,
                code,
                content,
              } = value;
              if (partStatus == "init" && textChunkLength > 0) {
                textOffset += textChunkLength + 1;
                textChunkLength = 0;
                innerStr += "\n";
              }
              if (type == "text") {
                if (toolCall) {
                  innerStr += "\n";
                  textOffset++;
                  toolCall = false;
                }
                if (partStatus == "finish") textChunkLength = text.length;
                return innerStr + text;
              } else if (
                type == "quote_result" &&
                status == "finish" &&
                meta_data &&
                _.isArray(meta_data.metadata_list)
              ) {
                refContent = meta_data.metadata_list.reduce((meta, v) => {
                  return meta + `${v.title} - ${v.url}\n`;
                }, refContent);
              } else if (
                type == "image" &&
                _.isArray(image) &&
                status == "finish"
              ) {
                const imageText =
                  image.reduce(
                    (imgs, v) =>
                      imgs +
                      (/^(http|https):\/\//.test(v.image_url)
                        ? `![图像](${v.image_url || ""})`
                        : ""),
                    ""
                  ) + "\n";
                textOffset += imageText.length;
                toolCall = true;
                return innerStr + imageText;
              } else if (type == "code" && partStatus == "init") {
                let codeHead = "";
                if (!codeGenerating) {
                  codeGenerating = true;
                  codeHead = "```python\n";
                }
                const chunk = code.substring(codeTemp.length, code.length);
                codeTemp += chunk;
                textOffset += codeHead.length + chunk.length;
                return innerStr + codeHead + chunk;
              } else if (
                type == "code" &&
                partStatus == "finish" &&
                codeGenerating
              ) {
                const codeFooter = "\n```\n";
                codeGenerating = false;
                codeTemp = "";
                textOffset += codeFooter.length;
                return innerStr + codeFooter;
              } else if (
                type == "execution_output" &&
                _.isString(content) &&
                partStatus == "done" &&
                lastExecutionOutput != content
              ) {
                lastExecutionOutput = content;
                const _content = content.replace(/^\n/, "");
                textOffset += _content.length + 1;
                return innerStr + _content + "\n";
              }
              return innerStr;
            }, "");
            return str + partText;
          }, "");
          const chunk = text.substring(
            data.choices[0].message.content.length - textOffset,
            text.length
          );
          data.choices[0].message.content += chunk;
        } else {
          data.choices[0].message.content =
            data.choices[0].message.content.replace(
              /【\d+†(来源|源|source)】/g,
              ""
            ) +
            (refContent
              ? `\n\n搜索结果来自：\n${refContent.replace(/\n$/, "")}`
              : "");
          resolve(data);
        }
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
    // 将流数据喂给SSE转换器
    stream.on("data", (buffer) => parser.feed(buffer.toString()));
    stream.once("error", (err) => reject(err));
    stream.once("close", () => resolve(data));
  });
}

/**
 * 创建转换流
 *
 * 将流格式转换为gpt兼容流格式
 *
 * @param stream 消息流
 * @param endCallback 传输结束回调
 */
function createTransStream(stream: any, endCallback?: Function) {
  // 消息创建时间
  const created = util.unixTimestamp();
  // 创建转换流
  const transStream = new PassThrough();
  let content = "";
  let toolCall = false;
  let codeGenerating = false;
  let textChunkLength = 0;
  let codeTemp = "";
  let lastExecutionOutput = "";
  let textOffset = 0;
  !transStream.closed &&
    transStream.write(
      `data: ${JSON.stringify({
        id: "",
        model: MODEL_NAME,
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
        created,
      })}\n\n`
    );
  const parser = createParser((event) => {
    try {
      if (event.type !== "event") return;
      // 解析JSON
      const result = _.attempt(() => JSON.parse(event.data));
      if (_.isError(result))
        throw new Error(`Stream response invalid: ${event.data}`);
      if (result.status != "finish" && result.status != "intervene") {
        const text = result.parts.reduce((str, part) => {
          const { status, content, meta_data } = part;
          if (!_.isArray(content)) return str;
          const partText = content.reduce((innerStr, value) => {
            const {
              status: partStatus,
              type,
              text,
              image,
              code,
              content,
            } = value;
            if (partStatus == "init" && textChunkLength > 0) {
              textOffset += textChunkLength + 1;
              textChunkLength = 0;
              innerStr += "\n";
            }
            if (type == "text") {
              if (toolCall) {
                innerStr += "\n";
                textOffset++;
                toolCall = false;
              }
              if (partStatus == "finish") textChunkLength = text.length;
              return innerStr + text;
            } else if (
              type == "quote_result" &&
              status == "finish" &&
              meta_data &&
              _.isArray(meta_data.metadata_list)
            ) {
              const searchText =
                meta_data.metadata_list.reduce(
                  (meta, v) => meta + `检索 ${v.title}(${v.url}) ...`,
                  ""
                ) + "\n";
              textOffset += searchText.length;
              toolCall = true;
              return innerStr + searchText;
            } else if (
              type == "image" &&
              _.isArray(image) &&
              status == "finish"
            ) {
              const imageText =
                image.reduce(
                  (imgs, v) =>
                    imgs +
                    (/^(http|https):\/\//.test(v.image_url)
                      ? `![图像](${v.image_url || ""})`
                      : ""),
                  ""
                ) + "\n";
              textOffset += imageText.length;
              toolCall = true;
              return innerStr + imageText;
            } else if (type == "code" && partStatus == "init") {
              let codeHead = "";
              if (!codeGenerating) {
                codeGenerating = true;
                codeHead = "```python\n";
              }
              const chunk = code.substring(codeTemp.length, code.length);
              codeTemp += chunk;
              textOffset += codeHead.length + chunk.length;
              return innerStr + codeHead + chunk;
            } else if (
              type == "code" &&
              partStatus == "finish" &&
              codeGenerating
            ) {
              const codeFooter = "\n```\n";
              codeGenerating = false;
              codeTemp = "";
              textOffset += codeFooter.length;
              return innerStr + codeFooter;
            } else if (
              type == "execution_output" &&
              _.isString(content) &&
              partStatus == "done" &&
              lastExecutionOutput != content
            ) {
              lastExecutionOutput = content;
              textOffset += content.length + 1;
              return innerStr + content + "\n";
            }
            return innerStr;
          }, "");
          return str + partText;
        }, "");
        const chunk = text.substring(content.length - textOffset, text.length);
        if (chunk) {
          content += chunk;
          const data = `data: ${JSON.stringify({
            id: result.conversation_id,
            model: MODEL_NAME,
            object: "chat.completion.chunk",
            choices: [
              { index: 0, delta: { content: chunk }, finish_reason: null },
            ],
            created,
          })}\n\n`;
          !transStream.closed && transStream.write(data);
        }
      } else {
        const data = `data: ${JSON.stringify({
          id: result.conversation_id,
          model: MODEL_NAME,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta:
                result.status == "intervene" &&
                result.last_error &&
                result.last_error.intervene_text
                  ? { content: `\n\n${result.last_error.intervene_text}` }
                  : {},
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          created,
        })}\n\n`;
        !transStream.closed && transStream.write(data);
        !transStream.closed && transStream.end("data: [DONE]\n\n");
        content = "";
        endCallback && endCallback(result.conversation_id);
      }
    } catch (err) {
      logger.error(err);
      !transStream.closed && transStream.end("\n\n");
    }
  });
  // 将流数据喂给SSE转换器
  stream.on("data", (buffer) => parser.feed(buffer.toString()));
  stream.once(
    "error",
    () => !transStream.closed && transStream.end("data: [DONE]\n\n")
  );
  stream.once(
    "close",
    () => !transStream.closed && transStream.end("data: [DONE]\n\n")
  );
  return transStream;
}

/**
 * 从流接收图像
 *
 * @param stream 消息流
 */
async function receiveImages(
  stream: any
): Promise<{ convId: string; imageUrls: string[] }> {
  return new Promise((resolve, reject) => {
    let convId = "";
    const imageUrls = [];
    const parser = createParser((event) => {
      try {
        if (event.type !== "event") return;
        // 解析JSON
        const result = _.attempt(() => JSON.parse(event.data));
        if (_.isError(result))
          throw new Error(`Stream response invalid: ${event.data}`);
        if (!convId && result.conversation_id) convId = result.conversation_id;
        if (result.status == "intervene")
          throw new APIException(EX.API_CONTENT_FILTERED);
        if (result.status != "finish") {
          result.parts.forEach((part) => {
            const { status: partStatus, content } = part;
            if (!_.isArray(content)) return;
            content.forEach((value) => {
              const { type, image, text } = value;
              if (
                type == "image" &&
                _.isArray(image) &&
                partStatus == "finish"
              ) {
                image.forEach((value) => {
                  if (
                    !/^(http|https):\/\//.test(value.image_url) ||
                    imageUrls.indexOf(value.image_url) != -1
                  )
                    return;
                  imageUrls.push(value.image_url);
                });
              }
              if (type == "text" && partStatus == "finish") {
                const urlPattern = /\((https?:\/\/\S+)\)/g;
                let match;
                while ((match = urlPattern.exec(text)) !== null) {
                  const url = match[1];
                  if (imageUrls.indexOf(url) == -1) imageUrls.push(url);
                }
              }
            });
          });
        }
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });
    // 将流数据喂给SSE转换器
    stream.on("data", (buffer) => parser.feed(buffer.toString()));
    stream.once("error", (err) => reject(err));
    stream.once("close", () =>
      resolve({
        convId,
        imageUrls,
      })
    );
  });
}

/**
 * Token切分
 *
 * @param authorization 认证字符串
 */
function tokenSplit(authorization: string) {
  return authorization.replace("Bearer ", "").split(",");
}

/**
 * 备用生成cookie
 *
 * 暂时还不需要
 *
 * @param refreshToken
 * @param token
 */
function generateCookie(refreshToken: string, token: string) {
  const timestamp = util.unixTimestamp();
  const gsTimestamp = timestamp - Math.round(Math.random() * 2592000);
  return {
    chatglm_refresh_token: refreshToken,
    // chatglm_user_id: '',
    _ga_PMD05MS2V9: `GS1.1.${gsTimestamp}.18.0.${gsTimestamp}.0.0.0`,
    chatglm_token: token,
    chatglm_token_expires: util.getDateString("yyyy-MM-dd HH:mm:ss"),
    abtestid: "a",
    // acw_tc: ''
  };
}

/**
 * 获取Token存活状态
 */
async function getTokenLiveStatus(refreshToken: string) {
  const result = await axios.post(
    "https://chatglm.cn/chatglm/backend-api/v1/user/refresh",
    {},
    {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        Referer: "https://chatglm.cn/main/alltoolsdetail",
        "X-Device-Id": util.uuid(false),
        "X-Request-Id": util.uuid(false),
        ...FAKE_HEADERS,
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  try {
    const { result: _result } = checkResult(result, refreshToken);
    const { accessToken } = _result;
    return !!accessToken;
  } catch (err) {
    return false;
  }
}

export default {
  createCompletion,
  createCompletionStream,
  generateImages,
  generateVideos,
  getTokenLiveStatus,
  tokenSplit,
};
