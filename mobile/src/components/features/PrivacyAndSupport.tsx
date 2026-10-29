import { useState, type ReactNode } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppLocale } from '../../services/locale';
import { openHelpFeedback } from '../feedback/helpFeedbackBus';
import { FeatureLinkRow, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
import { CommunityGuidelines } from './CommunityGuidelines';
import { DeleteAccountSettings } from './DeleteAccountSettings';
import { RedeemCodeSettings } from './RedeemCodeSettings';
import { useRedemptions } from '../../services/redeemCodes';
const COPY={en:{title:'Privacy & support',help:'Send feedback',privacy:'Privacy Policy',terms:'Terms of Use',deletion:'Account & Data Deletion',problem:'Report a problem',guidelines:'Community Guidelines',deleteAccount:'Delete account',redeem:'Redeem a code',redeemed:'Redeemed',groupHelp:'Get help',groupRules:'Rules & policies',groupAccount:'Account',close:'Close',
  support:'Contact support',mail:'Opening your email app to write to contact@jastrevia.com…',emergency:"PetalPal isn't an emergency service. If you or someone else is in danger, contact local emergency services."},
 'zh-Hans':{title:'隐私与帮助',help:'发送反馈',privacy:'隐私政策',terms:'使用条款',deletion:'账号与数据删除',problem:'报告问题',guidelines:'社区准则',deleteAccount:'删除账号',redeem:'兑换码',redeemed:'已兑换',groupHelp:'获取帮助',groupRules:'规则与政策',groupAccount:'账号',close:'关闭',
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
 const [dialog,setDialog]=useState<'delete'|'redeem'|null>(null);
 const [redemptions,setRedemptions]=useRedemptions(account);
 const copy=COPY[useAppLocale()];
 const titleColor=usePanelTheme().theme.text;
 const open=(url?:string)=>openPolicy(url,setStatus);
 const feedback=()=>{onLeave?.();setTimeout(openHelpFeedback,onLeave?250:0);};
 const support=()=>{setStatus(copy.mail);void open('mailto:contact@jastrevia.com');};
 const toggle=(item:'guidelines')=>setUnfolded(unfolded===item?null:item);
 // In Me: three groups, most used first, the one that cannot be undone last.
 // Redeem a code and Delete account each open their own dialog (delete: the warning and the
 // typed confirmation).
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
   <FeatureLinkRow first title={copy.redeem} note={redemptions?.length?copy.redeemed:undefined} onPress={()=>setDialog('redeem')}/>
   <FeatureLinkRow chevron={false} title={copy.deleteAccount} onPress={()=>setDialog('delete')}/>
  </Group>
  {dialog==='redeem'?<Dialog title={copy.redeem} closeLabel={copy.close} onClose={()=>setDialog(null)}>
   <RedeemCodeSettings redemptions={redemptions} onRedeemed={item=>setRedemptions([item])}/>
  </Dialog>:null}
  {dialog==='delete'?<Dialog title={copy.deleteAccount} closeLabel={copy.close} onClose={()=>setDialog(null)}>
   <DeleteAccountSettings embedded onPolicy={()=>void open(process.env.EXPO_PUBLIC_DELETION_URL)}/>
  </Dialog>:null}
  <Text style={ui.caption}>{copy.emergency}</Text></View>;
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
 <Text style={ui.caption}>{copy.emergency}</Text></View>;
}

function Group({label,children}:{label:string;children:ReactNode}){
 return <View style={{marginTop:10}}><Text style={[ui.caption,{fontWeight:'700',letterSpacing:.6,textTransform:'uppercase',marginBottom:2}]}>{label}</Text>{children}</View>;
}
// Its own dialog over the Me panel; × or a tap outside closes it without doing anything.
function Dialog({title,closeLabel,onClose,children}:{title:string;closeLabel:string;onClose:()=>void;children:ReactNode}){
 const {theme}=usePanelTheme();
 return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
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
export function PrivacyLinks(){
 const [expanded,setExpanded]=useState(false);
 const [status,setStatus]=useState('');
 const link={color:'#365b42',textDecorationLine:'underline' as const};
 if(expanded) return <View style={{gap:10}}><PrivacyAndSupport/>
  <Text accessibilityRole="button" style={[ui.caption,link]} onPress={()=>setExpanded(false)}>Hide privacy & support</Text></View>;
 return <View style={{gap:6}}>
  <Text style={[ui.caption,{textAlign:'center'}]}>By continuing, you agree to the{' '}
   <Text accessibilityRole="link" style={link} onPress={()=>void openPolicy(process.env.EXPO_PUBLIC_TERMS_URL,setStatus)}>Terms of Use</Text>{' '}and{' '}
   <Text accessibilityRole="link" style={link} onPress={()=>void openPolicy(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,setStatus)}>Privacy Policy</Text>.
   {' '}PetalPal is not a therapist or emergency service.</Text>
  <Text accessibilityRole="button" style={[ui.caption,link,{textAlign:'center'}]} onPress={()=>setExpanded(true)}>Privacy & support</Text>
  {status?<Text accessibilityRole="alert" style={ui.caption}>{status}</Text>:null}</View>;
}
