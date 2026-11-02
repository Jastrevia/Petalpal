// Voice input's messages come in English from the hook and the server; zh-Hans owners read these.
const ZH: readonly (readonly [RegExp, string])[] = [
  [/^Voice input uses AI/, '语音输入要用 AI 把声音转成文字，所以要先打开 AI 处理：我 → AI 与隐私。你也可以直接打字。'],
  [/^Microphone permission/, '需要麦克风权限才能语音输入：到 iPhone 设置里允许这个 App 使用麦克风。你也可以直接打字。'],
  [/temporarily unavailable/, '语音输入暂时不可用，请先打字。'],
  [/busy/, '语音输入正忙，请稍后再试或直接打字。'],
  [/^No speech/, '没有听到说话，请再试一次。'],
  [/^No recording/, '没有录到声音，请再试一次。'],
  [/timed out/, '转文字超时了，请再试一次或直接打字。'],
  [/^Unable to transcribe/, '这段录音没能转成文字，请再试一次或直接打字。'],
  [/can’t record/, '这个浏览器不能录音。请用 Safari 或 Chrome 打开，或者直接打字。'],
  [/\bAI\b/, '语音输入现在用不了（AI 额度或权限限制），请先打字。'],
];
export function voiceMessage(message: string, locale: string) {
  if (locale !== 'zh-Hans') return message;
  return ZH.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}
