import _ from "lodash";

import Request from "@/lib/request/Request.ts";
import chat from "@/api/controllers/chat.ts";
import util from "@/lib/util.ts";

export default {

  prefix: "/v1/videos",

  post: {

    "/generations": async (request: Request) => {
      request
        .validate(
          "body.conversation_id",
          (v) => _.isUndefined(v) || _.isString(v)
        )
        .validate("body.model", (v) => _.isUndefined(v) || _.isString(v))
        .validate("body.prompt", _.isString)
        .validate("body.audio_id", (v) => _.isUndefined(v) || _.isString(v))
        .validate("body.image_url", (v) => _.isUndefined(v) || _.isString(v))
        .validate(
          "body.video_style",
          (v) =>
            _.isUndefined(v) ||
            ["卡通3D", "黑白老照片", "油画", "电影感"].includes(v),
          "video_style must be one of 卡通3D/黑白老照片/油画/电影感"
        )
        .validate(
          "body.emotional_atmosphere",
          (v) =>
            _.isUndefined(v) ||
            ["温馨和谐", "生动活泼", "紧张刺激", "凄凉寂寞"].includes(v),
          "emotional_atmosphere must be one of 温馨和谐/生动活泼/紧张刺激/凄凉寂寞"
        )
        .validate(
          "body.mirror_mode",
          (v) =>
            _.isUndefined(v) || ["水平", "垂直", "推近", "拉远"].includes(v),
          "mirror_mode must be one of 水平/垂直/推近/拉远"
        )
        .validate("headers.authorization", _.isString);
      // refresh_token切分
      const tokens = chat.tokenSplit(request.headers.authorization);
      // 随机挑选一个refresh_token
      const token = _.sample(tokens);
      const {
        model,
        conversation_id: convId,
        prompt,
        image_url: imageUrl,
        video_style: videoStyle = "",
        emotional_atmosphere: emotionalAtmosphere = "",
        mirror_mode: mirrorMode = "",
        audio_id: audioId,
      } = request.body;
      const data = await chat.generateVideos(
        model,
        prompt,
        token,
        {
          imageUrl,
          videoStyle,
          emotionalAtmosphere,
          mirrorMode,
          audioId,
        },
        convId
      );
      return {
        created: util.unixTimestamp(),
        data,
      };
    },
  },

};
