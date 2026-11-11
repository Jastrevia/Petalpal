import {useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {useAuth} from '../../services/auth';
import {useAppLocale} from '../../services/locale';
import {FeatureActionButton,ui} from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
// Deleting is permanent, so it is said plainly first, and the button only works once the owner
// has typed the confirmation phrase exactly.
const COPY={en:{title:'Delete Account',warning:'Deleting your account permanently deletes all of your data. It cannot be undone or recovered.',
  what:'This removes your account, private Journals and photos, Events, memories, reflections, your Garden and its flowers, friends and messages. Minimal security and cost records, deletion retry records, backups and provider copies may remain under their retention policies. Copies other people already have cannot be recalled.',
  phrase:'DELETE',typeLabel:(phrase:string)=>`To confirm, type ${phrase} below.`,
  confirmPassword:'To make sure it’s you, enter your password, then tap the button again.',passwordLabel:'Your password',
  wrongPassword:'That isn’t your password. Try again.',
  signInAgain:'This account signs in with its email: sign out, sign in again and come back here within five minutes.',
  deleting:'Deleting…',delete:'Permanently delete my account',policy:'Read the full deletion policy'},
 'zh-Hans':{title:'删除账号',warning:'删除账号后，你的所有数据都会被永久删除，无法撤销，也无法恢复。',
  what:'将删除你的账号、私人日记和照片、事件、记忆、回顾、你的花园和花、好友和留言。少量安全与费用记录、删除重试记录、备份和服务商副本可能会按各自的保留政策继续保存一段时间。别人已经保存的内容无法收回。',
  phrase:'删除账号',typeLabel:(phrase:string)=>`请在下面输入「${phrase}」确认。`,
  confirmPassword:'为了确认是你本人，请输入你的密码，再点一次下面的按钮。',passwordLabel:'你的密码',
  wrongPassword:'密码不对，请再试一次。',
  signInAgain:'这个账号是用邮箱登录的：请先退出、重新登录，五分钟内回到这里删除。',
  deleting:'正在删除…',delete:'永久删除我的账号',policy:'查看完整的删除政策'}};
// `embedded`: inside the Me support list (its row is the title); `onPolicy` opens the published policy.
export function DeleteAccountSettings({embedded=false,onPolicy}:{embedded?:boolean;onPolicy?:()=>void}={}){
 const {deleteAccount}=useAuth();const copy=COPY[useAppLocale()];const {theme}=usePanelTheme();
 const [typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // Not signed in within the last few minutes: the server asks for the password here (no signing out and in again).
 const [askPassword,setAskPassword]=useState(false),[password,setPassword]=useState('');
 const confirmed=typed.trim()===copy.phrase;
 return <View style={{gap:10}}>{embedded?null:<Text accessibilityRole="header" style={[ui.title,{color:theme.text}]}>{copy.title}</Text>}
 <Text accessibilityRole="alert" style={[ui.text,{color:theme.text,fontWeight:'700'}]}>{copy.warning}</Text>
 <Text style={[ui.text,{color:theme.text}]}>{copy.what}</Text>
 {onPolicy?<Text accessibilityRole="link" onPress={onPolicy} style={[ui.caption,{color:theme.text,textDecorationLine:'underline'}]}>{copy.policy}</Text>:null}
 <Text style={[ui.text,{color:theme.text}]}>{copy.typeLabel(copy.phrase)}</Text>
 <TextInput accessibilityLabel={copy.typeLabel(copy.phrase)} value={typed} onChangeText={setTyped} editable={!busy}
  autoCapitalize="characters" autoCorrect={false} placeholder={copy.phrase} placeholderTextColor={theme.muted}
  style={{minHeight:42,borderRadius:10,borderWidth:1,borderColor:confirmed?theme.gold:theme.border,paddingHorizontal:12,color:theme.text,fontSize:15}}/>
 {askPassword?<><Text style={[ui.text,{color:theme.text}]}>{copy.confirmPassword}</Text>
  <TextInput accessibilityLabel={copy.passwordLabel} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry
   autoCapitalize="none" autoCorrect={false} autoComplete="current-password" placeholder={copy.passwordLabel} placeholderTextColor={theme.muted}
   style={{minHeight:42,borderRadius:10,borderWidth:1,borderColor:password?theme.gold:theme.border,paddingHorizontal:12,color:theme.text,fontSize:15}}/></>:null}
 <FeatureActionButton title={busy?copy.deleting:copy.delete} disabled={busy||!confirmed||(askPassword&&!password)} onPress={async()=>{
  if(!confirmed)return;setBusy(true);setError('');
  try{await deleteAccount(askPassword?password:undefined);}
  catch(e){
   const problem=e as Error&{code?:string};
   // A name-and-password account confirms with its password; an account that signs in by email signs in again.
   if(problem.code==='PASSWORD_CONFIRMATION_REQUIRED'){setAskPassword(true);setError('');}
   else if(problem.code==='auth/requires-recent-login')setError(copy.signInAgain);
   else if(problem.code==='PASSWORD_INCORRECT'){setPassword('');setError(copy.wrongPassword);}
   else setError(problem.message);
  }finally{setBusy(false);}}}/>
 {error?<Text accessibilityRole="alert" style={[ui.text,{color:theme.text}]}>{error}</Text>:null}</View>;
}
