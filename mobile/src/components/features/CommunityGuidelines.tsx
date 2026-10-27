import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../services/auth';
import { momentLocale } from '../moments/momentFormat';
import { FeatureActionButton, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
export const COMMUNITY_VERSION = 'petalpal-community-2026-10-15';
export const COMMUNITY_TEXT = 'Be kind. Do not publish harassment, hateful attacks, threats, abusive profanity, sexual exploitation, illegal instructions, spam, private information about others, or content you do not have rights to share. Profiles and Flower messages are visible to other users. Reports may be reviewed and content removed or social access restricted. Private emotional reflection and asking for help are welcome. PetalPal is not an emergency service. Report harmful content or block its author in the app. Contact: contact@jastrevia.com.';
export const COMMUNITY_TEXT_ZH = '请友善待人。不要发布骚扰、仇恨攻击、威胁、辱骂、性剥削、违法教程、垃圾信息、他人隐私，或你无权分享的内容。个人资料和花朵留言其他用户都能看到。被举报的内容可能会被审核、删除，或限制社交功能。欢迎在私人日记里表达情绪、寻求帮助。PetalPal 不是紧急服务。遇到有害内容可以在应用里举报或屏蔽对方。联系邮箱：contact@jastrevia.com。';
// The guidelines stay folded until asked for; accepting them is one tap either way.
export function CommunityGuidelines() {
  const [accepted,setAccepted]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
  const titleColor=usePanelTheme().theme.text;
  const chinese=momentLocale(useAuth().experience?.user.preferredLocale)==='zh-Hans';
  useEffect(()=>{let active=true;apiRequest<{accepted:boolean}>('/users/me/community-acceptance').then(v=>{if(active)setAccepted(v.accepted);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  return <View style={{gap:8}}>
    <View style={ui.row}><Text accessibilityRole="header" style={[ui.title,{flex:1,color:titleColor}]}>{chinese ? '社区准则' : 'Community Guidelines'}</Text>{accepted ? <Text style={ui.caption}>{chinese ? '已同意' : 'Accepted'}</Text> : null}</View>
    <FeatureActionButton secondary title={open ? (chinese ? '收起准则' : 'Hide the guidelines') : (chinese ? '阅读准则' : 'Read the guidelines')} onPress={()=>setOpen(!open)}/>
    {open ? <><Text style={ui.text}>{chinese ? COMMUNITY_TEXT_ZH : COMMUNITY_TEXT}</Text>
      <Text style={ui.caption}>{chinese ? '版本' : 'Version'} {COMMUNITY_VERSION}.</Text></> : null}
    {accepted === false ? <FeatureActionButton title={chinese ? '我同意社区准则' : 'I accept the Community Guidelines'} disabled={busy} onPress={async()=>{
      setBusy(true);setError('');try{await apiRequest('/users/me/community-acceptance','PUT',{version:COMMUNITY_VERSION,accepted:true});setAccepted(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }}/> : null}{error ? <Text accessibilityRole="alert" style={ui.text}>{error}</Text>:null}</View>;
}
