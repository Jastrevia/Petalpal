import { assertContentAllowed } from './content-safety.js';
import { SocialAccessError } from './garden-access.js';
export const COMMUNITY_VERSION = 'petalpal-community-2026-10-15';
// Independently authored social-only rules (no third-party dictionary), on top of the Event and
// Journal rules: words written to or about another person, which a friend will read. They cover
// telling someone to die or hurt themselves, bullying, slurs, sexual harassment and abusive
// swearing. A writer's own distress ("我想去死", "I want to die") is not matched here: the
// message composer shows its support note for that instead (mobile emotionalSafety.ts).
const SOCIAL_EN = new RegExp(`(?<![\\p{Script=Latin}\\p{N}])(?:${[
  // Death wishes and self-harm incitement aimed at someone else.
  "kys", "k\\s*y\\s*s", "go (?:and )?(?:die|kill yourself|hang yourself|jump off (?:a|the) (?:bridge|roof|building))",
  "(?:you should|just|pls|please) (?:die|go die|hang yourself|end yourself|end your life|cut yourself)",
  "(?:i )?hope (?:you|u) (?:die|get cancer|get hit by a (?:car|bus|truck))", "drop dead", "die in a (?:fire|hole|ditch)",
  "(?:nobody|no one|no1) (?:likes|loves|wants|cares about) (?:you|u)", "everyone hates (?:you|u)",
  "(?:you|u) (?:should(?:n't| not)|don't deserve to) (?:exist|be alive|live)", "(?:the )?world (?:would be|is) better without (?:you|u)",
  // Slurs.
  "retard(?:s|ed)?", "fag(?:s|got|gots)?", "nigg(?:er|ers|a|as)", "trann(?:y|ies)", "chinks?", "spics?", "kikes?",
  // Sexual harassment.
  "sluts?", "whores?", "dickheads?", "send (?:me )?(?:nudes|naked (?:pics|photos)|your nudes)", "dick pics?",
  "suck my (?:dick|cock)", "show me your (?:body|boobs|tits|breasts|naked)", "(?:wanna|want to) (?:fuck|bang|sleep with) (?:you|u)",
  // Abuse aimed at the reader.
  "(?:you(?:'re| are)|ur|u r) (?:so |such an? |a |an )?(?:ugly|fat|pathetic|disgusting|retarded|stupid|loser|freak|dumbass|moron|failure)",
  "dumbass(?:es)?", "stfu", "piece of shit",
].join("|")})(?![\\p{Script=Latin}\\p{N}])`, "iu");
const SOCIAL_ZH = new RegExp([
  // 叫别人去死、诅咒、自残教唆。
  "(?<!我)去死吧", "你(?:怎么|咋)?(?:还)?不去死", "你(?:就|快|赶紧|赶快|早点)?去死", "(?:快|赶紧|赶快|早点)去死", "死全家", "全家(?:都)?死光", "你(?:妈|爸|全家)死了",
  "祝你早死", "你(?:就)?该死", "你(?:不配|没资格)活", "你活着(?:就是|都是)浪费", "你(?:怎么|咋)不(?:去)?(?:跳楼|自杀|上吊)",
  // 霸凌和排挤。
  "没(?:有)?人喜欢你", "大家都(?:讨厌|恨)你", "所有人都(?:讨厌|恨)你",
  // 脏话和辱骂。
  "尼玛", "草泥马", "操你", "艹你", "日你(?:妈|全家|祖宗)", "你妈(?:逼|b)", "(?<![a-z])(?:cnm|nmsl|sb)(?![a-z])", "傻[叉缺屌]", "二逼", "[煞沙]笔", "煞比",
  "智障", "脑残", "弱智", "低能儿", "白痴", "狗东西", "狗日的", "王八蛋", "混蛋", "贱货", "婊子", "骚货", "滚蛋", "给我滚", "滚出去", "你(?:这个|就是个|是个|就是|是)(?:垃圾|人渣|畜生|loser)",
  // 歧视词。
  "黑鬼", "支那", "死基佬", "人妖",
  // 性骚扰。
  "约炮", "发(?:我|个|张|几张)?(?:你的)?裸照", "看(?:看)?你(?:的)?(?:裸体|胸)", "想(?:上|睡|干)你",
].join("|"), "u");

export function socialContentRejected(text) {
  const normalized = String(text).normalize('NFKC').normalize('NFD').replace(/[\p{M}\p{Cf}]/gu,'').replace(/[’‘ʼ]/g,"'").replace(/\s+/g,' ').toLowerCase();
  return /(?:\b(?:send (?:me )?nudes|child porn|rape you|buy cocaine)\b|儿童色情|强奸你)/u.test(normalized) ||
    SOCIAL_EN.test(normalized) || SOCIAL_ZH.test(normalized);
}

export function assertSocialContent(text) {
  assertContentAllowed(text);
  if (socialContentRejected(text)) {
    throw Object.assign(new Error('Please revise this social content to follow the Community Guidelines.'),{status:422,code:'CONTENT_REJECTED'});
  }
}

// What the writer of a rejected message to a friend sees, in the app language they chose.
export const SOCIAL_MESSAGE_REJECTED = Object.freeze({
  en: "This message was not sent. Your friend will read it, so please say it another way: PetalPal does not allow insults, threats, harassment, slurs, or telling someone to hurt themselves.",
  "zh-Hans": "这条留言没有发出去。朋友会看到它，请换一种说法：PetalPal 不允许辱骂、威胁、骚扰、歧视的话，也不允许叫别人去伤害自己。"
});
export const socialMessageRejected = preferredLocale => SOCIAL_MESSAGE_REJECTED[String(preferredLocale || "").startsWith("zh") ? "zh-Hans" : "en"];
export async function requireCommunityAcceptance(db, userId) {
  const user = await db.user.findUnique({where:{id:userId},select:{communityTermsVersion:true,socialRestricted:true}});
  if (user?.socialRestricted) throw new SocialAccessError('Social publication is unavailable',403);
  if (user?.communityTermsVersion !== COMMUNITY_VERSION) throw Object.assign(new SocialAccessError('Read and accept the Community Guidelines before publishing.',428),{code:'COMMUNITY_ACCEPTANCE_REQUIRED'});
}
export function installCommunityPolicy(app, db) {
  app.get('/users/me/community-acceptance', async(req,res)=>{
    const user=await db.user.findUnique({where:{id:req.auth.userId},select:{communityTermsVersion:true}});
    res.json({version:COMMUNITY_VERSION,accepted:user?.communityTermsVersion===COMMUNITY_VERSION});
  });
  app.put('/users/me/community-acceptance',async(req,res)=>{
    if(req.body.version!==COMMUNITY_VERSION || req.body.accepted!==true || Object.keys(req.body).some(k=>!['version','accepted'].includes(k))) return res.status(400).json({error:'Explicit acceptance of the current Community Guidelines is required'});
    await db.user.update({where:{id:req.auth.userId},data:{communityTermsVersion:COMMUNITY_VERSION,communityAcceptedAt:new Date()}});
    res.json({version:COMMUNITY_VERSION,accepted:true});
  });
}
