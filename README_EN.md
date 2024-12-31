# GLM AI Free Service

[![](https://img.shields.io/github/license/llm-red-team/glm-free-api.svg)](LICENSE)
![](https://img.shields.io/github/stars/llm-red-team/glm-free-api.svg)
![](https://img.shields.io/github/forks/llm-red-team/glm-free-api.svg)
![](https://img.shields.io/docker/pulls/vinlic/glm-free-api.svg)

Supports high-speed streaming output, multi-turn dialogues, internet search, long document reading, image analysis, zero-configuration deployment, multi-token support, and automatic session trace cleanup.

Fully compatible with the ChatGPT interface.

Also, the following free APIs are available for your attention:

Moonshot AI (Kimi.ai) API to API [kimi-free-api](https://github.com/LLM-Red-Team/kimi-free-api/tree/master)

StepFun (StepChat) API to API [step-free-api](https://github.com/LLM-Red-Team/step-free-api)

Ali Tongyi (Qwen) API to API [qwen-free-api](https://github.com/LLM-Red-Team/qwen-free-api)

ZhipuAI (ChatGLM) API to API [glm-free-api](https://github.com/LLM-Red-Team/glm-free-api)

ByteDance (Doubao) API to API [doubao-free-api](https://github.com/LLM-Red-Team/doubao-free-api)

Meta Sota (metaso) API to API [metaso-free-api](https://github.com/LLM-Red-Team/metaso-free-api)

Iflytek Spark (Spark) API to API [spark-free-api](https://github.com/LLM-Red-Team/spark-free-api)

MiniMax（Hailuo）API to API [hailuo-free-api](https://github.com/LLM-Red-Team/hailuo-free-api)

DeepSeek（DeepSeek）API to API [deepseek-free-api](https://github.com/LLM-Red-Team/deepseek-free-api)

Lingxin Intelligence (Emohaa) API to API [emohaa-free-api](https://github.com/LLM-Red-Team/emohaa-free-api) (OUT OF ORDER)

## Table of Contents

* [Announcement](#Announcement)
* [Online Experience](#Online-Experience)
* [Effect Examples](#Effect-Examples)
* [Access Preparation](#Access-Preparation)
    * [Agent Access](#Agent-Access)
    * [Multiple Account Access](#Multiple-Account-Access)
* [Docker Deployment](#Docker-Deployment)
    * [Docker-compose Deployment](#Docker-compose-Deployment)
    * [Render Deployment](#Render-Deployment)
    * [Vercel Deployment](#Vercel-Deployment)
* [Native Deployment](#Native-Deployment)
* [Recommended Clients](#Recommended-Clients)
* [Interface List](#Interface-List)
    * [Conversation Completion](#Conversation-Completion)
    * [Video Generation](#Video-Generation)
    * [AI Drawing](#AI-Drawing)
    * [Document Interpretation](#Document-Interpretation)
    * [Image Analysis](#Image-Analysis)
    * [Refresh_token Survival Detection](#Refresh_token-Survival-Detection)
* [Notification](#Notification)
    * [Nginx Anti-generation Optimization](#Nginx-Anti-generation-Optimization)
    * [Token Statistics](#Token-Statistics)
* [Star History](#star-history)
  
## Announcement

**This API is unstable. So we highly recommend you go to the [Zhipu](https://open.bigmodel.cn/) use the offical API, avoiding banned.**

**This organization and individuals do not accept any financial donations and transactions. This project is purely for research, communication, and learning purposes!**

**For personal use only, it is forbidden to provide services or commercial use externally to avoid causing service pressure on the official, otherwise, bear the risk yourself!**

**For personal use only, it is forbidden to provide services or commercial use externally to avoid causing service pressure on the official, otherwise, bear the risk yourself!**

**For personal use only, it is forbidden to provide services or commercial use externally to avoid causing service pressure on the official, otherwise, bear the risk yourself!**

## Online Experience
This link is only for temporary testing of functions and cannot be used for a long time. For long-term use, please deploy by yourself.

https://udify.app/chat/Pe89TtaX3rKXM8NS

## Effect Examples

### Identity Verification

![Identity Verification](./doc/example-1.png)

### AI-Agent

Agent link：[Comments Generator](https://chatglm.cn/main/gdetail/65c046a531d3fcb034918abe)

![AI-Agent](./doc/example-9.png)

### Combined with Dify workflow

Experience link：https://udify.app/chat/m46YgeVLNzFh4zRs

<img width="390" alt="image" src="https://github.com/LLM-Red-Team/glm-free-api/assets/20235341/4773b9f6-b1ca-460c-b3a7-c56bdb1f0659">

### Multi-turn Dialogue

![Multi-turn Dialogue](./doc/example-6.png)

### Video Generation

[View](https://sfile.chatglm.cn/testpath/video/c1f59468-32fa-58c3-bd9d-ab4230cfe3ca_0.mp4)

### AI Drawing

![AI Drawing](./doc/example-10.png)

### Internet Search

![Internet Search](./doc/example-2.png)

### Long Document Reading

![Long Document Reading](./doc/example-5.png)

### Using Code

![Using Code](./doc/example-12.png)

### Image Analysis

![Image Analysis](./doc/example-3.png)

## Access Preparation

Obtain `refresh_token` from [Zhipu](https://chatglm.cn/)

Enter Zhipu Qingyan and start a random conversation, then press F12 to open the developer tools. Find the value of `tongyi_sso_ticket` in Application > Cookies, which will be used as the Bearer Token value for Authorization: `Authorization: Bearer TOKEN`

![example0](./doc/example-0.png)

### Agent Access

Open a window of Agent Chat, the ID in the url is the ID of the Agent, which is the parameter of `model`.

![example11](./doc/example-11.png)

### Multiple Account Access

You can provide multiple account chatglm_refresh_tokens and use `,` to join them:

`Authorization: Bearer TOKEN1,TOKEN2,TOKEN3`

The service will pick one each time a request is made.

## Docker Deployment

Please prepare a server with a public IP and open port 8000.

Pull the image and start the service

```shell
docker run -it -d --init --name step-free-api -p 8000:8000 -e TZ=Asia/Shanghai vinlic/step-free-api:latest
```

check real-time service logs

```shell
docker logs -f glm-free-api
```

Restart service

```shell
docker restart glm-free-api
```

Shut down service

```shell
docker stop glm-free-api
```

### Docker-compose Deployment

```yaml
version: '3'

services:
  glm-free-api:
    container_name: glm-free-api
    image: vinlic/glm-free-api:latest
    restart: always
    ports:
      - "8000:8000"
    environment:
      - TZ=Asia/Shanghai
```

### Render Deployment

**Attention: Some deployment regions may not be able to connect to Kimi. If container logs show request timeouts or connection failures (Singapore has been tested and found unavailable), please switch to another deployment region!**

**Attention: Container instances for free accounts will automatically stop after a period of inactivity, which may result in a 50-second or longer delay during the next request. It is recommended to check [Render Container Keepalive](https://github.com/LLM-Red-Team/free-api-hub/#Render%E5%AE%B9%E5%99%A8%E4%BF%9D%E6%B4%BB)**

1. Fork this project to your GitHub account.

2. Visit [Render](https://dashboard.render.com/) and log in with your GitHub account.

3. Build your Web Service (`New+` -> `Build and deploy from a Git repository` -> `Connect your forked project` -> `Select deployment region` -> `Choose instance type as Free` -> `Create Web Service`).

4. After the build is complete, copy the assigned domain and append the URL to access it.

### Vercel Deployment

**Note: Vercel free accounts have a request response timeout of 10 seconds, but interface responses are usually longer, which may result in a 504 timeout error from Vercel!**

Please ensure that Node.js environment is installed first.

```shell
npm i -g vercel --registry http://registry.npmmirror.com
vercel login
git clone https://github.com/LLM-Red-Team/glm-free-api
cd glm-free-api
vercel --prod
```

## Native Deployment

Please prepare a server with a public IP and open port 8000.

Please install the Node.js environment and configure the environment variables first, and confirm that the node command is available.

Install dependencies

```shell
npm i
```

Install PM2 for process guarding

```shell
npm i -g pm2
```

Compile and build. When you see the dist directory, the build is complete.

```shell
npm run build
```

Start service

```shell
pm2 start dist/index.js --name "glm-free-api"
```

View real-time service logs

```shell
pm2 logs glm-free-api
```

Restart service

```shell
pm2 reload glm-free-api
```

Shut down service

```shell
pm2 stop glm-free-api
```

## Recommended Clients

Using the following second-developed clients for free-api series projects is faster and easier, and supports document/image uploads!

[Clivia](https://github.com/Yanyutin753/lobe-chat)'s modified LobeChat [https://github.com/Yanyutin753/lobe-chat](https://github.com/Yanyutin753/lobe-chat)

[Time@](https://github.com/SuYxh)'s modified ChatGPT Web [https://github.com/SuYxh/chatgpt-web-sea](https://github.com/SuYxh/chatgpt-web-sea)

## interface List

Currently, the `/v1/chat/completions` interface compatible with openai is supported. You can use the client access interface compatible with openai or other clients, or use online services such as [dify](https://dify.ai/) Access and use.

### Conversation Completion

Conversation completion interface, compatible with openai's [chat-completions-api](https://platform.openai.com/docs/guides/text-generation/chat-completions-api).

**POST /v1/chat/completions**

The header needs to set the Authorization header:

```
Authorization: Bearer [refresh_token]
```

Request data:
```json
{
    // Default model: glm-4-plus
    // zero thinking model: glm-4-zero / glm-4-think
    // If using the Agent, fill in the Agent ID here
    "model": "glm-4",
    // Currently, multi-round conversations are realized based on message merging, which in some scenarios may lead to capacity degradation and is limited by the maximum number of tokens in a single round.
    // If you want a native multi-round dialog experience, you can pass in the ids obtained from the last round of messages to pick up the context
    // "conversation_id": "65f6c28546bae1f0fbb532de",
    "messages": [
        {
            "role": "user",
            "content": "Who RU？"
        }
    ],
    // If using SSE stream, please set it to true, the default is false
    "stream": false
}
```

Response data：
```json
{
    "id": "65f6c28546bae1f0fbb532de",
    "model": "glm-4",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "My name is Zhipu Qingyan."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "total_tokens": 2
    },
    "created": 1710152062
}
```

### Video Generation

Video API

**If you're not VIP, you will wait in line for a long time.**

**POST /v1/videos/generations**

The header needs to set the Authorization header:

```
Authorization: Bearer [refresh_token]
```

Request data:
```json
{
    // 模型名称
    // cogvideox：默认官方视频模型
    // cogvideox-pro：先生成图像再作为参考图像生成视频，作为视频首帧引导视频效果，但耗时更长
    "model": "cogvideox",
    // 视频生成提示词
    "prompt": "一只可爱的猫走在花丛中",
    // 支持使用图像URL或者BASE64_URL作为视频首帧参考图像（如果使用cogvideox-pro则会忽略此参数）
    // "image_url": "https://sfile.chatglm.cn/testpath/b5341945-3839-522c-b4ab-a6268cb131d5_0.png",
    // 支持设置视频风格：卡通3D/黑白老照片/油画/电影感
    // "video_style": "油画",
    // 支持设置情感氛围：温馨和谐/生动活泼/紧张刺激/凄凉寂寞
    // "emotional_atmosphere": "生动活泼",
    // 支持设置运镜方式：水平/垂直/推近/拉远
    // "mirror_mode": "水平"
}
```

Response data:
```json
{
    "created": 1722103836,
    "data": [
        {
            // 对话ID，目前没啥用
            "conversation_id": "66a537ec0603e53bccb8900a",
            // 封面URL
            "cover_url": "https://sfile.chatglm.cn/testpath/video_cover/c1f59468-32fa-58c3-bd9d-ab4230cfe3ca_cover_0.png",
            // 视频URL
            "video_url": "https://sfile.chatglm.cn/testpath/video/c1f59468-32fa-58c3-bd9d-ab4230cfe3ca_0.mp4",
            // 视频时长
            "video_duration": "6s",
            // 视频分辨率
            "resolution": "1440 × 960"
        }
    ]
}
```

### AI Drawing

This format is compatible with the [gpt-4-vision-preview](https://platform.openai.com/docs/guides/vision) API format.

**POST /v1/images/generations**

The header needs to set the Authorization header:

```
Authorization: Bearer [refresh_token]
```

Request data:
```json
{
    // 如果使用智能体请填写智能体ID到此处，否则可以乱填
    "model": "cogview-3",
    "prompt": "A cute cat"
}
```

Response data:
```json
{
    "created": 1711507449,
    "data": [
        {
            "url": "https://sfile.chatglm.cn/testpath/5e56234b-34ae-593c-ba4e-3f7ba77b5768_0.png"
        }
    ]
}
```

### Document Interpretation

Provide an accessible file URL or BASE64_URL to parse.

**POST /v1/chat/completions**

The header needs to set the Authorization header:

```
Authorization: Bearer [refresh_token]
```

Request data:
```json
{
    // 如果使用智能体请填写智能体ID到此处，否则可以乱填
    "model": "glm-4",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "file",
                    "file_url": {
                        "url": "https://mj101-1317487292.cos.ap-shanghai.myqcloud.com/ai/test.pdf"
                    }
                },
                {
                    "type": "text",
                    "text": "文档里说了什么？"
                }
            ]
        }
    ],
    // 如果使用SSE流请设置为true，默认false
    "stream": false
}
```

Response data:
```json
{
    "id": "cnmuo7mcp7f9hjcmihn0",
    "model": "glm-4",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "根据文档内容，我总结如下：\n\n这是一份关于希腊罗马时期的魔法咒语和仪式的文本，包含几个魔法仪式：\n\n1. 一个涉及面包、仪式场所和特定咒语的仪式，用于使某人爱上你。\n\n2. 一个针对女神赫卡忒的召唤仪式，用来折磨某人直到她自愿来到你身边。\n\n3. 一个通过念诵爱神阿芙罗狄蒂的秘密名字，连续七天进行仪式，来赢得一个美丽女子的心。\n\n4. 一个通过燃烧没药并念诵咒语，让一个女子对你产生强烈欲望的仪式。\n\n这些仪式都带有魔法和迷信色彩，使用各种咒语和象征性行为来影响人的感情和意愿。"
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "total_tokens": 2
    },
    "created": 100920
}
```

### Image Analysis

Provide an accessible image URL or BASE64_URL to parse.

This format is compatible with the [gpt-4-vision-preview](https://platform.openai.com/docs/guides/vision) API format. You can also use this format to transmit documents for parsing.

**POST /v1/chat/completions**

The header needs to set the Authorization header:

```
Authorization: Bearer [refresh_token]
```

Request data:
```json
{
    "model": "65c046a531d3fcb034918abe",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "http://1255881664.vod2.myqcloud.com/6a0cd388vodbj1255881664/7b97ce1d3270835009240537095/uSfDwh6ZpB0A.png"
                    }
                },
                {
                    "type": "text",
                    "text": "图像描述了什么？"
                }
            ]
        }
    ],
    "stream": false
}
```

Response data:
```json
{
    "id": "65f6c28546bae1f0fbb532de",
    "model": "glm",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "图片中展示的是一个蓝色背景下的logo，具体地，左边是一个由多个蓝色的圆点组成的圆形图案，右边是“智谱·AI”四个字，字体颜色为蓝色。"
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "total_tokens": 2
    },
    "created": 1710670469
}
```

### Refresh_token Survival Detection

Check whether refresh_token is alive. If live is not true, otherwise it is false. Please do not call this interface frequently (less than 10 minutes).

**POST /token/check**

Request data:
```json
{
    "token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9..."
}
```

Response data:
```json
{
    "live": true
}
```

## Notification

### Nginx Anti-generation Optimization

If you are using Nginx reverse proxy `glm-free-api`, please add the following configuration items to optimize the output effect of the stream and optimize the experience.

```nginx
# Turn off proxy buffering. When set to off, Nginx will immediately send client requests to the backend server and immediately send responses received from the backend server back to the client.
proxy_buffering off;
# Enable chunked transfer encoding. Chunked transfer encoding allows servers to send data in chunks for dynamically generated content without knowing the size of the content in advance.
chunked_transfer_encoding on;
# Turn on TCP_NOPUSH, which tells Nginx to send as much data as possible before sending the packet to the client. This is usually used in conjunction with sendfile to improve network efficiency.
tcp_nopush on;
# Turn on TCP_NODELAY, which tells Nginx not to delay sending data and to send small data packets immediately. In some cases, this can reduce network latency.
tcp_nodelay on;
#Set the timeout to keep the connection, here it is set to 120 seconds. If there is no further communication between client and server during this time, the connection will be closed.
keepalive_timeout 120;
```

### Token Statistics

Since the inference side is not in glm-free-api, the token cannot be counted and will be returned as a fixed number!!!!!

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=LLM-Red-Team/glm-free-api&type=Date)](https://star-history.com/#LLM-Red-Team/glm-free-api&Date)
