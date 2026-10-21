/**
 * A direct video FILE — what the media library hands back for an imported
 * mp4/webm (`media_browse` import_from_url / upload). The embed block renders
 * it as a native <video> (provider "video"), never as an iframe, so an agent
 * writes { url } and nothing else: before 2026-10-21 the only road was
 * customEmbed with hand-written <video> HTML, which is where a 7 MB base64
 * data-URI video came from. Shared by the public renderer and the admin editor.
 */
const VIDEO_FILE = /\.(mp4|webm|m4v|ogv|ogg|mov)(?:[?#]|$)/i;

export const isVideoFileUrl = (url: string | undefined): boolean => !!url && VIDEO_FILE.test(url);
