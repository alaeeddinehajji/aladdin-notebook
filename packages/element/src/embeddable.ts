import {
  FONT_FAMILY,
  VERTICAL_ALIGN,
  escapeDoubleQuotes,
  getFontString,
} from "@excalidraw/common";

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { MarkRequired } from "@excalidraw/common/utility-types";

import { newTextElement } from "./newElement";
import { wrapText } from "./textWrapping";
import { isIframeElement } from "./typeChecks";

import type {
  ExcalidrawElement,
  ExcalidrawIframeLikeElement,
  IframeData,
} from "./types";

type IframeDataWithSandbox = MarkRequired<IframeData, "sandbox">;

const embeddedLinkCache = new Map<string, IframeDataWithSandbox>();

const RE_YOUTUBE =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?youtu(?:be\.com|\.be)\/(embed\/|watch\?v=|shorts\/|playlist\?list=|embed\/videoseries\?list=)?([a-zA-Z0-9_-]+)/;

const RE_VIMEO =
  /^(?:http(?:s)?:\/\/)?(?:(?:w){3}\.)?(?:player\.)?vimeo\.com\/(?:video\/)?([^?\s]+)(?:\?.*)?$/;
const RE_FIGMA = /^https:\/\/(?:www\.)?figma\.com/;

const RE_GH_GIST = /^https:\/\/gist\.github\.com\/([\w_-]+)\/([\w_-]+)/;
const RE_GH_GIST_EMBED =
  /^<script[\s\S]*?\ssrc=["'](https:\/\/gist\.github\.com\/.*?)\.js["']/i;

const RE_MSFORMS = /^(?:https?:\/\/)?forms\.microsoft\.com\//;

// not anchored to start to allow <blockquote> twitter embeds
const RE_TWITTER =
  /(?:https?:\/\/)?(?:(?:w){3}\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/;
const RE_TWITTER_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:twitter|x)\.com\/[^"']*)/i;

const RE_VALTOWN =
  /^https:\/\/(?:www\.)?val\.town\/(v|embed)\/[a-zA-Z_$][0-9a-zA-Z_$]+\.[a-zA-Z_$][0-9a-zA-Z_$]+/;

const RE_GENERIC_EMBED =
  /^<(?:iframe|blockquote)[\s\S]*?\s(?:src|href)=["']([^"']*)["'][\s\S]*?>$/i;

const RE_GIPHY =
  /giphy.com\/(?:clips|embed|gifs)\/[a-zA-Z0-9]*?-?([a-zA-Z0-9]+)(?:[^a-zA-Z0-9]|$)/;

const RE_REDDIT =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

const RE_REDDIT_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:www\.)?reddit\.com\/[^"']*)/i;

const RE_SPOTIFY =
  /^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/;

const RE_GOOGLE_MAPS =
  /^(?:https?:\/\/)?(?:www\.)?google\.com\/maps\/(?:embed|place|d\/|@)/;
const RE_GOOGLE_MAPS_SHORT =
  /^(?:https?:\/\/)?maps\.google\.com/;
const RE_GOOGLE_MAPS_EMBED =
  /^(?:https?:\/\/)?(?:www\.)?google\.com\/maps\/embed/;

const RE_GOOGLE_DOCS =
  /^(?:https?:\/\/)?docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/;

const RE_LOOM =
  /^(?:https?:\/\/)?(?:www\.)?loom\.com\/(share|embed)\/([a-zA-Z0-9_-]+)/;

const RE_CODEPEN =
  /^(?:https?:\/\/)?(?:www\.)?codepen\.io\/([a-zA-Z0-9_-]+)\/(?:pen|embed|full)\/([a-zA-Z0-9_-]+)/;

const RE_CODESANDBOX =
  /^(?:https?:\/\/)?(?:www\.)?codesandbox\.io\/(?:s|embed|p)\/([a-zA-Z0-9_-]+)/;

const RE_MIRO =
  /^(?:https?:\/\/)?(?:www\.)?miro\.com\/app\/board\/([a-zA-Z0-9_=-]+)/;

const RE_AIRTABLE =
  /^(?:https?:\/\/)?airtable\.com\/(shr[a-zA-Z0-9]+|embed\/[a-zA-Z0-9_/]+|app[a-zA-Z0-9]+)/;

const RE_NOTION =
  /^(?:https?:\/\/)?(?:www\.)?notion\.so\//;

const RE_SOUNDCLOUD =
  /^(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;

const RE_TWITCH =
  /^(?:https?:\/\/)?(?:www\.)?twitch\.tv\/(?:videos\/([0-9]+)|([a-zA-Z0-9_]+))/;

const RE_DAILYMOTION =
  /^(?:https?:\/\/)?(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/;

const RE_TED =
  /^(?:https?:\/\/)?(?:www\.)?ted\.com\/talks\/([a-zA-Z0-9_]+)/;

const RE_SLIDESHARE =
  /^(?:https?:\/\/)?(?:www\.)?slideshare\.net\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;

const RE_CANVA =
  /^(?:https?:\/\/)?(?:www\.)?canva\.com\/design\/([a-zA-Z0-9_-]+)/;

const RE_OBSERVABLE =
  /^(?:https?:\/\/)?observablehq\.com\//;

const RE_JSFIDDLE =
  /^(?:https?:\/\/)?(?:www\.)?jsfiddle\.net\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;

const RE_REPLIT =
  /^(?:https?:\/\/)?(?:www\.)?replit\.com\/(@[a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;

const RE_DESMOS =
  /^(?:https?:\/\/)?(?:www\.)?desmos\.com\/(calculator|geometry)\/([a-zA-Z0-9]+)/;

const RE_GEOGEBRA =
  /^(?:https?:\/\/)?(?:www\.)?geogebra\.org\/(m|calculator|graphing|geometry|3d)\/([a-zA-Z0-9]+)/;

const RE_WIKIPEDIA =
  /^(?:https?:\/\/)?([a-z]{2,3})\.wikipedia\.org\/wiki\/([^\s]+)/;

const RE_PITCH =
  /^(?:https?:\/\/)?(?:www\.)?pitch\.com\/(?:public|embed)\/([a-zA-Z0-9_-]+)/;

const RE_EXCALIDRAW =
  /^(?:https?:\/\/)?(?:www\.)?excalidraw\.com\//;

const parseYouTubeTimestamp = (url: string): number => {
  let timeParam: string | null | undefined;

  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    timeParam =
      urlObj.searchParams.get("t") || urlObj.searchParams.get("start");
  } catch (error) {
    const timeMatch = url.match(/[?&#](?:t|start)=([^&#\s]+)/);
    timeParam = timeMatch?.[1];
  }

  if (!timeParam) {
    return 0;
  }

  if (/^\d+$/.test(timeParam)) {
    return parseInt(timeParam, 10);
  }

  const timeMatch = timeParam.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!timeMatch) {
    return 0;
  }

  const [, hours = "0", minutes = "0", seconds = "0"] = timeMatch;
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
};

const ALLOWED_DOMAINS = new Set([
  // Video
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "twitch.tv",
  "player.twitch.tv",
  "dailymotion.com",
  // Social
  "twitter.com",
  "x.com",
  "reddit.com",
  // Design & Whiteboard
  "figma.com",
  "miro.com",
  "canva.com",
  "pitch.com",
  "excalidraw.com",
  "link.excalidraw.com",
  // Music & Audio
  "spotify.com",
  "open.spotify.com",
  "soundcloud.com",
  "w.soundcloud.com",
  // Code
  "gist.github.com",
  "codepen.io",
  "codesandbox.io",
  "stackblitz.com",
  "val.town",
  "jsfiddle.net",
  "replit.com",
  "observablehq.com",
  // Google (only embed-friendly subdomains, NOT google.com itself)
  "maps.google.com",
  "docs.google.com",
  // Productivity & Docs
  "notion.so",
  "airtable.com",
  "forms.microsoft.com",
  // Presentations & Education
  "ted.com",
  "slideshare.net",
  "desmos.com",
  "geogebra.org",
  // Media
  "giphy.com",
  "loom.com",
  // Reference
  "*.wikipedia.org",
  // PDF
  "*.simplepdf.eu",
]);

const ALLOW_SAME_ORIGIN = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "figma.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "reddit.com",
  "forms.microsoft.com",
  "miro.com",
  "canva.com",
  "pitch.com",
  "excalidraw.com",
  "link.excalidraw.com",
  "spotify.com",
  "open.spotify.com",
  "codepen.io",
  "codesandbox.io",
  "jsfiddle.net",
  "replit.com",
  "observablehq.com",
  "maps.google.com",
  "docs.google.com",
  "notion.so",
  "airtable.com",
  "loom.com",
  "twitch.tv",
  "player.twitch.tv",
  "dailymotion.com",
  "ted.com",
  "slideshare.net",
  "desmos.com",
  "geogebra.org",
  "soundcloud.com",
  "w.soundcloud.com",
  "*.wikipedia.org",
]);

export const createSrcDoc = (body: string) => {
  return `<html><body>${body}</body></html>`;
};

export const getEmbedLink = (
  link: string | null | undefined,
): IframeDataWithSandbox | null => {
  if (!link) {
    return null;
  }

  if (embeddedLinkCache.has(link)) {
    return embeddedLinkCache.get(link)!;
  }

  const originalLink = link;

  const allowSameOrigin = ALLOW_SAME_ORIGIN.has(
    matchHostname(link, ALLOW_SAME_ORIGIN) || "",
  );

  let type: "video" | "generic" = "generic";
  let aspectRatio = { w: 560, h: 840 };
  const ytLink = link.match(RE_YOUTUBE);
  if (ytLink?.[2]) {
    const startTime = parseYouTubeTimestamp(originalLink);
    const time = startTime > 0 ? `&start=${startTime}` : ``;
    const isPortrait = link.includes("shorts");
    type = "video";
    switch (ytLink[1]) {
      case "embed/":
      case "watch?v=":
      case "shorts/":
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
      case "playlist?list=":
      case "embed/videoseries?list=":
        link = `https://www.youtube.com/embed/videoseries?list=${ytLink[2]}&enablejsapi=1${time}`;
        break;
      default:
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
    }
    aspectRatio = isPortrait ? { w: 315, h: 560 } : { w: 560, h: 315 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const vimeoLink = link.match(RE_VIMEO);
  if (vimeoLink?.[1]) {
    const target = vimeoLink?.[1];
    const error = !/^\d+$/.test(target)
      ? new URIError("Invalid embed link format")
      : undefined;
    type = "video";
    link = `https://player.vimeo.com/video/${target}?api=1`;
    aspectRatio = { w: 560, h: 315 };
    //warning deliberately ommited so it is displayed only once per link
    //same link next time will be served from cache
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      error,
      sandbox: { allowSameOrigin },
    };
  }

  const figmaLink = link.match(RE_FIGMA);
  if (figmaLink) {
    type = "generic";
    link = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(
      link,
    )}`;
    aspectRatio = { w: 550, h: 550 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const valLink = link.match(RE_VALTOWN);
  if (valLink) {
    link =
      valLink[1] === "embed" ? valLink[0] : valLink[0].replace("/v", "/embed");
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  if (RE_MSFORMS.test(link) && !link.includes("embed=true")) {
    link += link.includes("?") ? "&embed=true" : "?embed=true";
  }

  if (RE_TWITTER.test(link)) {
    const postId = link.match(RE_TWITTER)![1];
    // the embed srcdoc still supports twitter.com domain only.
    // Note that we don't attempt to parse the username as it can consist of
    // non-latin1 characters, and the username in the url can be set to anything
    // without affecting the embed.
    const safeURL = escapeDoubleQuotes(
      `https://twitter.com/x/status/${postId}`,
    );

    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="twitter-tweet" data-dnt="true" data-theme="${theme}"><a href="${safeURL}"></a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_REDDIT.test(link)) {
    const [, page, postId, title] = link.match(RE_REDDIT)!;
    const safeURL = escapeDoubleQuotes(
      `https://reddit.com/r/${page}/comments/${postId}/${title}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="reddit-embed-bq" data-embed-theme="${theme}"><a href="${safeURL}"></a><br></blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_GH_GIST.test(link)) {
    const [, user, gistId] = link.match(RE_GH_GIST)!;
    const safeURL = escapeDoubleQuotes(
      `https://gist.github.com/${user}/${gistId}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: () =>
        createSrcDoc(`
          <script src="${safeURL}.js"></script>
          <style type="text/css">
            * { margin: 0px; }
            table, .gist { height: 100%; }
            .gist .gist-file { height: calc(100vh - 2px); padding: 0px; display: grid; grid-template-rows: 1fr auto; }
          </style>
        `),
      intrinsicSize: { w: 550, h: 720 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(link, ret);
    return ret;
  }

  // Spotify
  const spotifyMatch = link.match(RE_SPOTIFY);
  if (spotifyMatch) {
    const [, spotifyType, spotifyId] = spotifyMatch;
    const isCompact = spotifyType === "track";
    link = `https://open.spotify.com/embed/${spotifyType}/${spotifyId}`;
    aspectRatio = isCompact ? { w: 400, h: 152 } : { w: 400, h: 480 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Google Maps
  if (RE_GOOGLE_MAPS_EMBED.test(link) || RE_GOOGLE_MAPS.test(link) || RE_GOOGLE_MAPS_SHORT.test(link)) {
    if (!RE_GOOGLE_MAPS_EMBED.test(link)) {
      link = `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d0!2d0!3d0!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z!5e0!3m2!1sen!2s!4v0&q=${encodeURIComponent(originalLink)}`;
    }
    aspectRatio = { w: 600, h: 450 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Google Docs / Sheets / Slides / Forms
  const googleDocsMatch = link.match(RE_GOOGLE_DOCS);
  if (googleDocsMatch) {
    const [, docType, docId] = googleDocsMatch;
    const typeMap: Record<string, string> = {
      document: "document",
      spreadsheets: "spreadsheets",
      presentation: "presentation",
      forms: "forms",
    };
    const t = typeMap[docType] || docType;
    if (t === "forms") {
      link = `https://docs.google.com/${t}/d/e/${docId}/viewform?embedded=true`;
    } else if (t === "presentation") {
      link = `https://docs.google.com/${t}/d/${docId}/embed?start=false&loop=false&delayms=3000`;
    } else {
      link = `https://docs.google.com/${t}/d/${docId}/preview`;
    }
    aspectRatio = t === "presentation" ? { w: 960, h: 569 } : { w: 800, h: 600 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Loom
  const loomMatch = link.match(RE_LOOM);
  if (loomMatch) {
    const [, , loomId] = loomMatch;
    link = `https://www.loom.com/embed/${loomId}`;
    type = "video";
    aspectRatio = { w: 560, h: 315 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // CodePen
  const codepenMatch = link.match(RE_CODEPEN);
  if (codepenMatch) {
    const [, cpUser, cpPen] = codepenMatch;
    link = `https://codepen.io/${cpUser}/embed/${cpPen}?default-tab=result`;
    aspectRatio = { w: 560, h: 400 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // CodeSandbox
  const csMatch = link.match(RE_CODESANDBOX);
  if (csMatch) {
    const [, csId] = csMatch;
    link = `https://codesandbox.io/embed/${csId}`;
    aspectRatio = { w: 560, h: 400 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Miro
  const miroMatch = link.match(RE_MIRO);
  if (miroMatch) {
    const [, boardId] = miroMatch;
    link = `https://miro.com/app/live-embed/${boardId}/`;
    aspectRatio = { w: 768, h: 432 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Airtable
  if (RE_AIRTABLE.test(link)) {
    if (!link.includes("/embed/")) {
      link = link.replace("airtable.com/", "airtable.com/embed/");
    }
    aspectRatio = { w: 700, h: 533 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // SoundCloud
  if (RE_SOUNDCLOUD.test(link)) {
    link = `https://w.soundcloud.com/player/?url=${encodeURIComponent(link)}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true`;
    aspectRatio = { w: 560, h: 300 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Twitch
  const twitchMatch = link.match(RE_TWITCH);
  if (twitchMatch) {
    const parentDomain = typeof window !== "undefined" ? window.location.hostname : "localhost";
    if (twitchMatch[1]) {
      link = `https://player.twitch.tv/?video=${twitchMatch[1]}&parent=${parentDomain}`;
    } else if (twitchMatch[2]) {
      link = `https://player.twitch.tv/?channel=${twitchMatch[2]}&parent=${parentDomain}`;
    }
    type = "video";
    aspectRatio = { w: 560, h: 315 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Dailymotion
  const dailymotionMatch = link.match(RE_DAILYMOTION);
  if (dailymotionMatch) {
    link = `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;
    type = "video";
    aspectRatio = { w: 560, h: 315 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // TED Talks
  const tedMatch = link.match(RE_TED);
  if (tedMatch) {
    link = `https://embed.ted.com/talks/${tedMatch[1]}`;
    type = "video";
    aspectRatio = { w: 560, h: 315 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Desmos
  const desmosMatch = link.match(RE_DESMOS);
  if (desmosMatch) {
    const [, desmosType, desmosId] = desmosMatch;
    link = `https://www.desmos.com/${desmosType}/${desmosId}?embed`;
    aspectRatio = { w: 600, h: 400 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // GeoGebra
  const geogebraMatch = link.match(RE_GEOGEBRA);
  if (geogebraMatch) {
    const [, geoType, geoId] = geogebraMatch;
    if (geoType === "m") {
      link = `https://www.geogebra.org/material/iframe/id/${geoId}`;
    }
    aspectRatio = { w: 800, h: 600 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // JSFiddle
  const jsfiddleMatch = link.match(RE_JSFIDDLE);
  if (jsfiddleMatch) {
    link = `https://jsfiddle.net/${jsfiddleMatch[1]}/${jsfiddleMatch[2]}/embedded/result/`;
    aspectRatio = { w: 560, h: 400 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Replit
  const replitMatch = link.match(RE_REPLIT);
  if (replitMatch) {
    link = `https://replit.com/${replitMatch[1]}/${replitMatch[2]}?embed=true`;
    aspectRatio = { w: 600, h: 400 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Wikipedia
  const wikiMatch = link.match(RE_WIKIPEDIA);
  if (wikiMatch) {
    const [, lang, article] = wikiMatch;
    link = `https://${lang}.m.wikipedia.org/wiki/${article}`;
    aspectRatio = { w: 600, h: 500 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin: false },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Pitch
  const pitchMatch = link.match(RE_PITCH);
  if (pitchMatch) {
    link = `https://pitch.com/embed/${pitchMatch[1]}`;
    aspectRatio = { w: 960, h: 569 };
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: aspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  embeddedLinkCache.set(link, {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  });
  return {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  };
};

export const createPlaceholderEmbeddableLabel = (
  element: ExcalidrawIframeLikeElement,
): ExcalidrawElement => {
  let text: string;
  if (isIframeElement(element)) {
    text = "IFrame element";
  } else {
    text =
      !element.link || element?.link === "" ? "Empty Web-Embed" : element.link;
  }

  const fontSize = Math.max(
    Math.min(element.width / 2, element.width / text.length),
    element.width / 30,
  );
  const fontFamily = FONT_FAMILY.Helvetica;

  const fontString = getFontString({
    fontSize,
    fontFamily,
  });

  return newTextElement({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
    strokeColor:
      element.strokeColor !== "transparent" ? element.strokeColor : "black",
    backgroundColor: "transparent",
    fontFamily,
    fontSize,
    text: wrapText(text, fontString, element.width - 20),
    textAlign: "center",
    verticalAlign: VERTICAL_ALIGN.MIDDLE,
    angle: element.angle ?? 0,
  });
};

const matchHostname = (
  url: string,
  /** using a Set assumes it already contains normalized bare domains */
  allowedHostnames: Set<string> | string,
): string | null => {
  try {
    const { hostname } = new URL(url);

    const bareDomain = hostname.replace(/^www\./, "");

    if (allowedHostnames instanceof Set) {
      if (ALLOWED_DOMAINS.has(bareDomain)) {
        return bareDomain;
      }

      const bareDomainWithFirstSubdomainWildcarded = bareDomain.replace(
        /^([^.]+)/,
        "*",
      );
      if (ALLOWED_DOMAINS.has(bareDomainWithFirstSubdomainWildcarded)) {
        return bareDomainWithFirstSubdomainWildcarded;
      }
      return null;
    }

    const bareAllowedHostname = allowedHostnames.replace(/^www\./, "");
    if (bareDomain === bareAllowedHostname) {
      return bareAllowedHostname;
    }
  } catch (error) {
    // ignore
  }
  return null;
};

export const maybeParseEmbedSrc = (str: string): string => {
  const twitterMatch = str.match(RE_TWITTER_EMBED);
  if (twitterMatch && twitterMatch.length === 2) {
    return twitterMatch[1];
  }

  const redditMatch = str.match(RE_REDDIT_EMBED);
  if (redditMatch && redditMatch.length === 2) {
    return redditMatch[1];
  }

  const gistMatch = str.match(RE_GH_GIST_EMBED);
  if (gistMatch && gistMatch.length === 2) {
    return gistMatch[1];
  }

  if (RE_GIPHY.test(str)) {
    return `https://giphy.com/embed/${RE_GIPHY.exec(str)![1]}`;
  }

  const match = str.match(RE_GENERIC_EMBED);
  if (match && match.length === 2) {
    return match[1];
  }

  return str;
};

export const embeddableURLValidator = (
  url: string | null | undefined,
  validateEmbeddable: ExcalidrawProps["validateEmbeddable"],
): boolean => {
  if (!url) {
    return false;
  }
  if (validateEmbeddable != null) {
    if (typeof validateEmbeddable === "function") {
      const ret = validateEmbeddable(url);
      // if return value is undefined, leave validation to default
      if (typeof ret === "boolean") {
        return ret;
      }
    } else if (typeof validateEmbeddable === "boolean") {
      return validateEmbeddable;
    } else if (validateEmbeddable instanceof RegExp) {
      return validateEmbeddable.test(url);
    } else if (Array.isArray(validateEmbeddable)) {
      for (const domain of validateEmbeddable) {
        if (domain instanceof RegExp) {
          if (url.match(domain)) {
            return true;
          }
        } else if (matchHostname(url, domain)) {
          return true;
        }
      }
      return false;
    }
  }

  return !!matchHostname(url, ALLOWED_DOMAINS);
};
