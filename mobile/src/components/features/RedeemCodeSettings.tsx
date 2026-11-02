import {useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {useAppLocale} from '../../services/locale';
import {formatRedeemInput,redeemCode,useRedemptions,type Redemption,type RedeemFailure} from '../../services/redeemCodes';
import {FeatureActionButton,ui} from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
import { Dialog } from './PrivacyAndSupport';
// A code someone gave the owner. Once it is redeemed, its gift is kept for them: the gift itself
// is still being made, and this says so plainly.
const COPY={en:{title:'Redeem a code',redeemed:'Redeemed',close:'Close',intro:'Have a code from PetalPal? Enter it here.',label:'Redemption code',redeem:'Redeem',redeeming:'Checking…',
  done:'Code redeemed. Your gift is saved to your account.',pending:'The gift is still in development. It will appear here on its own once it’s ready.',
  already:'You’ve redeemed a code.',
  errors:{INVALID_CODE:'That code isn’t valid. Check it and try again.',CODE_USED:'This code has already been used.',
   ALREADY_REDEEMED:'You’ve already redeemed a code like this one.',TOO_MANY:'Too many tries. Please wait an hour and try again.',
   OFFLINE:'Couldn’t reach PetalPal. Check your connection and try again.'} satisfies Record<RedeemFailure,string>},
 'zh-Hans':{title:'兑换码',redeemed:'已兑换',close:'关闭',intro:'收到了 PetalPal 的兑换码？在这里输入。',label:'兑换码',redeem:'兑换',redeeming:'正在验证…',
  done:'兑换成功，礼物已存进你的账号。',pending:'这份礼物还在开发中，做好后会自动出现在这里。',
  already:'你已经兑换过兑换码。',
  errors:{INVALID_CODE:'兑换码无效，请检查后再试。',CODE_USED:'这个兑换码已经被使用过了。',
   ALREADY_REDEEMED:'你已经兑换过这类兑换码了。',TOO_MANY:'尝试次数太多，请一小时后再试。',
   OFFLINE:'连接不上 PetalPal，请检查网络后再试。'} satisfies Record<RedeemFailure,string>}};
// Beside the Beta tester badge in Me, the same small size; the code itself goes in its own dialog.
export function RedeemCodeChip(){
 const copy=COPY[useAppLocale()];const {theme}=usePanelTheme();
 const [open,setOpen]=useState(false),[redemptions,setRedemptions]=useRedemptions();
 return <>
  <Pressable testID="redeem-chip" accessibilityRole="button" accessibilityLabel={copy.title} hitSlop={{top:11,bottom:11,left:4,right:4}} onPress={()=>setOpen(true)}
   style={({pressed})=>[{paddingHorizontal:10,paddingVertical:3,borderRadius:999,borderWidth:1,borderColor:theme.gold},pressed&&ui.pressed]}>
   <Text style={{fontSize:12,fontWeight:'600',letterSpacing:.4,color:theme.text}}>{redemptions?.length?copy.redeemed:copy.title} ›</Text>
  </Pressable>
  {open?<Dialog title={copy.title} closeLabel={copy.close} onClose={()=>setOpen(false)}>
   <RedeemCodeSettings redemptions={redemptions} onRedeemed={item=>setRedemptions([item])}/>
  </Dialog>:null}
 </>;
}
export function RedeemCodeSettings({redemptions,onRedeemed}:{redemptions:Redemption[]|null;onRedeemed:(item:Redemption)=>void}){
 const copy=COPY[useAppLocale()];const {theme}=usePanelTheme();
 const [typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[justDone,setJustDone]=useState(false);
 const complete=typed.replace(/-/g,'').length===20;
 if(redemptions?.length) return <View style={{gap:10}}>
  <Text accessibilityRole={justDone?'alert':undefined} style={[ui.text,{color:theme.text,fontWeight:'700'}]}>{justDone?copy.done:copy.already}</Text>
  <Text style={[ui.text,{color:theme.text}]}>{copy.pending}</Text></View>;
 const submit=async()=>{
  if(!complete||busy)return;setBusy(true);setError('');
  const result=await redeemCode(typed);setBusy(false);
  if(result.ok){setJustDone(true);onRedeemed(result.redemption);}else setError(copy.errors[result.reason]);
 };
 return <View style={{gap:10}}>
 <Text style={[ui.text,{color:theme.text}]}>{copy.intro}</Text>
 <TextInput accessibilityLabel={copy.label} value={typed} onChangeText={text=>{setTyped(formatRedeemInput(text));setError('');}} editable={!busy}
  autoCapitalize="characters" autoCorrect={false} autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" placeholderTextColor={theme.muted}
  onSubmitEditing={()=>void submit()} returnKeyType="done" maxLength={23}
  style={{minHeight:44,borderRadius:10,borderWidth:1,borderColor:complete?theme.gold:theme.border,paddingHorizontal:12,color:theme.text,fontSize:16,letterSpacing:1,fontVariant:['tabular-nums']}}/>
 <FeatureActionButton title={busy?copy.redeeming:copy.redeem} disabled={busy||!complete} onPress={()=>void submit()}/>
 {error?<Text accessibilityRole="alert" style={[ui.text,{color:theme.text}]}>{error}</Text>:null}</View>;
}
