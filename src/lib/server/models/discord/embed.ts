import {
  type InferOutput,
  array,
  boolean,
  maxValue,
  minValue,
  number,
  object,
  optional,
  picklist,
  pipe,
  safeInteger,
  string,
} from 'valibot';

import { Timestamp } from '$lib/server/models/timestamp';
import { Url } from '$lib/server/models/url';

export const enum EmbedType {
  Rich = 'rich',
  Image = 'image',
  Video = 'video',
  Gifv = 'gifv',
  Article = 'article',
  Link = 'link',
  PollResult = 'poll_result',
}

export const EmbedFooter = object({
  text: string(),
  icon_url: optional(Url),
  proxy_icon_url: optional(Url),
});

export type EmbedFooter = InferOutput<typeof EmbedFooter>;

export const EmbedImage = object({
  url: Url,
  proxy_url: optional(Url),
  width: optional(pipe(number(), safeInteger(), minValue(0))),
  height: optional(pipe(number(), safeInteger(), minValue(0))),
});

export type EmbedImage = InferOutput<typeof EmbedImage>;

export const EmbedVideo = object({
  url: optional(Url),
  proxy_url: optional(Url),
  width: optional(pipe(number(), safeInteger(), minValue(0))),
  height: optional(pipe(number(), safeInteger(), minValue(0))),
});

export type EmbedVideo = InferOutput<typeof EmbedVideo>;

export const EmbedProvider = object({
  name: optional(string()),
  url: optional(Url),
});

export type EmbedProvider = InferOutput<typeof EmbedProvider>;

export const EmbedAuthor = object({
  name: string(),
  url: optional(Url),
  icon_url: optional(Url),
  proxy_icon_url: optional(Url),
});

export type EmbedAuthor = InferOutput<typeof EmbedAuthor>;

export const EmbedField = object({
  name: string(),
  value: string(),
  inline: optional(boolean()),
});

export type EmbedField = InferOutput<typeof EmbedField>;

export const Embed = object({
  type: optional(
    picklist([
      EmbedType.Rich,
      EmbedType.Image,
      EmbedType.Video,
      EmbedType.Gifv,
      EmbedType.Article,
      EmbedType.Link,
      EmbedType.PollResult,
    ]),
  ),
  title: optional(string()),
  description: optional(string()),
  url: optional(Url),
  timestamp: optional(Timestamp),
  color: optional(pipe(number(), safeInteger(), minValue(0x000000), maxValue(0xffffff))),
  footer: optional(EmbedFooter),
  image: optional(EmbedImage),
  thumbnail: optional(EmbedImage),
  video: optional(EmbedVideo),
  provider: optional(EmbedProvider),
  author: optional(EmbedAuthor),
  fields: optional(array(EmbedField)),
});

export type Embed = InferOutput<typeof Embed>;
