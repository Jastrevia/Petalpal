import { useState, type ReactNode } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppLocale } from '../../services/locale';
import { openHelpFeedback } from '../feedback/helpFeedbackBus';
import { FeatureLinkRow, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
import { CommunityGuidelines } from './CommunityGuidelines';
import { DeleteAccountSettings } from './DeleteAccountSettings';
import { BlockedUsers } from './SafetyActions';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';
const COPY={en:{title:'Privacy & support',help:'Send feedback',privacy:'Privacy Policy',terms:'Terms of Use',deletion:'Account & Data Deletion',problem:'Report a problem',guidelines:'Community Guidelines',deleteAccount:'Delete account',groupHelp:'Get help',groupRules:'Rules & policies',groupAccount:'Account',close:'Close',blocked:'Blocked users',groupAbout:'About',thanks:'Acknowledgements',
  thanksBody:['Thank you to our friend Boge Ling, whose petalpal-moments project shared the ideas and early work that helped Fairy Moments grow into the feed your Garden Fairy posts to today.','PetalPal is also built on the work of many open-source communities, including Expo, React Native, React Native Skia and Prisma. We are grateful to everyone who keeps them going.','And thank you to our first beta testers, whose honest notes shape every corner of this Garden.'],
 
  support:'Contact support',mail:'Opening your email app to write to contact@jastrevia.com…',emergency:"PetalPal isn't an emergency service. If you or someone else is in danger, contact local emergency services."},
 'zh-Hans':{title:'隐私与帮助',help:'发送反馈',privacy:'隐私政策',terms:'使用条款',deletion:'账号与数据删除',problem:'报告问题',guidelines:'社区准则',deleteAccount:'删除账号',groupHelp:'获取帮助',groupRules:'规则与政策',groupAccount:'账号',close:'关闭',blocked:'已屏蔽的人',groupAbout:'关于',thanks:'致谢',
  thanksBody:['感谢我们的朋友 Boge Ling。petalpal-moments 项目分享的想法和早期作品，帮助小花仙的朋友圈长成了今天的样子。','PetalPal 也建立在许多开源社区的成果之上，包括 Expo、React Native、React Native Skia 和 Prisma。谢谢每一位维护它们的人。','也谢谢最早来花园内测的朋友们，你们真诚的反馈让这里的每个角落都变得更好。'],
 
  support:'联系客服',mail:'正在打开邮件应用，写信到 contact@jastrevia.com…',emergency:'PetalPal 不是紧急服务。如果你或他人有危险，请联系当地紧急服务。'}};
// On the web a page opens in a new tab, so the Garden stays where it was.
async function openPolicy(url:string|undefined,setStatus:(value:string)=>void){if(!url){setStatus('This policy URL is awaiting publication. Contact contact@jastrevia.com.');return;}
 try{if(Platform.OS==='web'&&/^https?:/.test(url)&&typeof window!=='undefined'){window.open(url,'_blank','noopener');return;}await Linking.openURL(url);}catch{setStatus('Unable to open the link. Please contact contact@jastrevia.com.');}}
// Settings: the published policies, support and a way to report a problem, as buttons. The policy
// text itself lives on the published pages, not in the panel.
// In Me (`account`), the Community Guidelines and account deletion unfold in this same list; the
// deletion row replaces the separate deletion-policy link (the policy is linked inside it).
// `onLeave` closes the panel around this list first, so Help & Feedback opens on top of the Garden.
export function PrivacyAndSupport({account=false,onLeave}:{account?:boolean;onLeave?:()=>void}={}){
 const [status,setStatus]=useState('');
 const [unfolded,setUnfolded]=useState<'guidelines'|null>(null);
 const [dialog,setDialog]=useState<'delete'|'blocked'|'thanks'|null>(null);
 const copy=COPY[useAppLocale()];
 const titleColor=usePanelTheme().theme.text;
 const open=(url?:string)=>openPolicy(url,setStatus);
 const feedback=()=>{onLeave?.();setTimeout(openHelpFeedback,onLeave?250:0);};
 const support=()=>{setStatus(copy.mail);void open('mailto:contact@jastrevia.com');};
 const toggle=(item:'guidelines')=>setUnfolded(unfolded===item?null:item);
 // In Me: three groups, most used first, the one that cannot be undone last.
 // Delete account opens its own dialog (the warning and the typed confirmation). Redeem a code sits
 // beside the Beta tester badge at the top of Me.
 if(account) return <View style={{gap:6}}><Text accessibilityRole="header" style={[ui.title,{color:titleColor}]}>{copy.title}</Text>
  <Group label={copy.groupHelp}>
   <FeatureLinkRow first title={copy.help} onPress={feedback}/>
   <FeatureLinkRow title={copy.support} onPress={support}/>
  </Group>
  {status?<Text accessibilityRole="alert" style={[ui.text,{color:titleColor}]}>{status}</Text>:null}
  <Group label={copy.groupRules}>
   <FeatureLinkRow first title={copy.guidelines} expanded={unfolded==='guidelines'} onPress={()=>toggle('guidelines')}/>
   {unfolded==='guidelines'?<Unfolded><CommunityGuidelines embedded/></Unfolded>:null}
   <FeatureLinkRow title={copy.privacy} onPress={()=>void open(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)}/>
   <FeatureLinkRow title={copy.terms} onPress={()=>void open(process.env.EXPO_PUBLIC_TERMS_URL)}/>
  </Group>
  <Group label={copy.groupAccount}>
   <FeatureLinkRow first title={copy.blocked} onPress={()=>setDialog('blocked')}/>
   <FeatureLinkRow chevron={false} title={copy.deleteAccount} onPress={()=>setDialog('delete')}/>
  </Group>
  <Group label={copy.groupAbout}>
   <FeatureLinkRow first title={copy.thanks} onPress={()=>setDialog('thanks')}/>
  </Group>
  {dialog==='blocked'?<Dialog title={copy.blocked} closeLabel={copy.close} onClose={()=>setDialog(null)}><BlockedUsers/></Dialog>:null}
  {dialog==='thanks'?<Dialog title={copy.thanks} closeLabel={copy.close} onClose={()=>setDialog(null)}>
   <View testID="acknowledgements" style={{gap:12}}>{copy.thanksBody.map((line,index)=><Text key={index} style={[ui.text,{color:titleColor}]}>{line}</Text>)}</View>
  </Dialog>:null}
  {dialog==='delete'?<Dialog title={copy.deleteAccount} closeLabel={copy.close} onClose={()=>setDialog(null)}>
   <DeleteAccountSettings embedded onPolicy={()=>void open(process.env.EXPO_PUBLIC_DELETION_URL)}/>
  </Dialog>:null}
  <Text style={[ui.caption,{color:titleColor}]}>{copy.emergency}</Text></View>;
 return <View style={{gap:6}}><Text accessibilityRole="header" style={[ui.title,{color:titleColor}]}>{copy.title}</Text>
 <View>
 <FeatureLinkRow first title={copy.help} onPress={feedback}/>
 <FeatureLinkRow title={copy.privacy} onPress={()=>void open(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)}/>
 <FeatureLinkRow title={copy.terms} onPress={()=>void open(process.env.EXPO_PUBLIC_TERMS_URL)}/>
 <FeatureLinkRow title={copy.deletion} onPress={()=>void open(process.env.EXPO_PUBLIC_DELETION_URL)}/>
 <FeatureLinkRow title={copy.problem} onPress={()=>{setStatus(copy.mail);void open(problemReportUrl());}}/>
 <FeatureLinkRow title={copy.support} onPress={support}/>
 </View>
 {status?<Text accessibilityRole="alert" style={[ui.text,{color:titleColor}]}>{status}</Text>:null}
 <Text style={[ui.caption,{color:titleColor}]}>{copy.emergency}</Text></View>;
}

function Group({label,children}:{label:string;children:ReactNode}){
 return <View style={{marginTop:10}}><Text style={[ui.caption,{fontWeight:'700',letterSpacing:.6,textTransform:'uppercase',marginBottom:2}]}>{label}</Text>{children}</View>;
}
// Its own dialog over the Me panel; × or a tap outside closes it without doing anything.
export function Dialog({title,closeLabel,onClose,children}:{title:string;closeLabel:string;onClose:()=>void;children:ReactNode}){
 const {theme}=usePanelTheme();
 return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible animationType="fade" onRequestClose={onClose}>
  <View style={dialog.scrim}>
   <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={StyleSheet.absoluteFill}/>
   <View accessibilityViewIsModal style={[dialog.card,{backgroundColor:theme.background,borderColor:theme.gold}]}>
    <View style={dialog.header}>
     <Text accessibilityRole="header" style={[ui.title,{color:theme.text,flex:1}]}>{title}</Text>
     <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} hitSlop={8}
      style={[dialog.close,{backgroundColor:theme.input}]}><Text style={{color:theme.text,fontSize:18}}>✕</Text></Pressable>
    </View>
    <ScrollView style={{flexShrink:1}} keyboardShouldPersistTaps="handled">{children}</ScrollView>
   </View>
  </View>
 </Modal>;
}
const dialog=StyleSheet.create({
 scrim:{flex:1,alignItems:'center',justifyContent:'center',padding:18,backgroundColor:'#0A1A1799'},
 card:{width:'100%',maxWidth:420,maxHeight:'100%',borderRadius:22,borderWidth:1,padding:18,gap:12,boxShadow:'0 14px 40px #00000055'},
 header:{flexDirection:'row',alignItems:'center',gap:12},
 close:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
});
function Unfolded({children}:{children:ReactNode}){return <View style={{paddingBottom:12,paddingHorizontal:2}}>{children}</View>;}

// A bug report by email, with what helps us reproduce it filled in. Nothing private is attached.
export function problemReportUrl(now=new Date()){
 const device=Platform.OS==='web'&&typeof navigator!=='undefined'?navigator.userAgent:`${Platform.OS} ${String(Platform.Version)}`;
 const body=['What happened:','','What you expected:','','Steps to make it happen again:','1.','',
  '— Please don\'t include passwords or private entries.',`Device: ${device}`,`Time: ${now.toISOString()}`].join('\n');
 return `mailto:contact@jastrevia.com?subject=${encodeURIComponent('PetalPal problem report')}&body=${encodeURIComponent(body)}`;
}

// Compact sign-in footer: links plus a one-line safety note; the full notice
// stays one tap away here and in the in-app Privacy & support panel.
// The account pages' footer, in the app language (before an account, the English | 中文 switch's).
const LINKS_COPY={en:{agree:'By continuing, you agree to the',and:'and',terms:'Terms of Use',privacy:'Privacy Policy',
  notTherapy:'PetalPal is not a therapist or emergency service.',open:'Privacy & support',hide:'Hide privacy & support'},
 'zh-Hans':{agree:'继续即表示你同意',and:'和',terms:'使用条款',privacy:'隐私政策',
  notTherapy:'PetalPal 不是心理治疗，也不是紧急求助服务。',open:'隐私与帮助',hide:'收起隐私与帮助'}};
export function PrivacyLinks(){
 const [expanded,setExpanded]=useState(false);
 const [status,setStatus]=useState('');
 const t=LINKS_COPY[useAppLocale()];
 const link={color:'#365b42',textDecorationLine:'underline' as const};
 if(expanded) return <View style={{gap:10}}><PrivacyAndSupport/>
  <Text accessibilityRole="button" style={[ui.caption,link]} onPress={()=>setExpanded(false)}>{t.hide}</Text></View>;
 return <View style={{gap:6}}>
  <Text style={[ui.caption,{textAlign:'center'}]}>{t.agree}{' '}
   <Text accessibilityRole="link" style={link} onPress={()=>void openPolicy(process.env.EXPO_PUBLIC_TERMS_URL,setStatus)}>{t.terms}</Text>{' '}{t.and}{' '}
   <Text accessibilityRole="link" style={link} onPress={()=>void openPolicy(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,setStatus)}>{t.privacy}</Text>.
   {' '}{t.notTherapy}</Text>
  <Text accessibilityRole="button" style={[ui.caption,link,{textAlign:'center'}]} onPress={()=>setExpanded(true)}>{t.open}</Text>
  {status?<Text accessibilityRole="alert" style={ui.caption}>{status}</Text>:null}</View>;
}
