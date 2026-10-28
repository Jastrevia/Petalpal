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
  recent:'You must have signed in within the last five minutes. If asked, sign out, sign in again and come back here.',
  deleting:'Deleting…',delete:'Permanently delete my account',policy:'Read the full deletion policy'},
 'zh-Hans':{title:'删除账号',warning:'删除账号后，你的所有数据都会被永久删除，无法撤销，也无法恢复。',
  what:'将删除你的账号、私人日记和照片、事件、记忆、回顾、你的花园和花、好友和留言。少量安全与费用记录、删除重试记录、备份和服务商副本可能会按各自的保留政策继续保存一段时间。别人已经保存的内容无法收回。',
  phrase:'删除账号',typeLabel:(phrase:string)=>`请在下面输入「${phrase}」确认。`,
  recent:'你需要在最近五分钟内登录过。如果被要求，请先退出再重新登录，然后回到这里。',
  deleting:'正在删除…',delete:'永久删除我的账号',policy:'查看完整的删除政策'}};
// `embedded`: inside the Me support list (its row is the title); `onPolicy` opens the published policy.
export function DeleteAccountSettings({embedded=false,onPolicy}:{embedded?:boolean;onPolicy?:()=>void}={}){
 const {deleteAccount}=useAuth();const copy=COPY[useAppLocale()];const {theme}=usePanelTheme();
 const [typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const confirmed=typed.trim()===copy.phrase;
 return <View style={{gap:10}}>{embedded?null:<Text accessibilityRole="header" style={[ui.title,{color:theme.text}]}>{copy.title}</Text>}
 <Text accessibilityRole="alert" style={[ui.text,{color:theme.text,fontWeight:'700'}]}>{copy.warning}</Text>
 <Text style={ui.text}>{copy.what}</Text>
 {onPolicy?<Text accessibilityRole="link" onPress={onPolicy} style={[ui.caption,{color:theme.text,textDecorationLine:'underline'}]}>{copy.policy}</Text>:null}
 <Text style={[ui.text,{color:theme.text}]}>{copy.typeLabel(copy.phrase)}</Text>
 <TextInput accessibilityLabel={copy.typeLabel(copy.phrase)} value={typed} onChangeText={setTyped} editable={!busy}
  autoCapitalize="characters" autoCorrect={false} placeholder={copy.phrase} placeholderTextColor={theme.muted}
  style={{minHeight:42,borderRadius:10,borderWidth:1,borderColor:confirmed?theme.gold:theme.border,paddingHorizontal:12,color:theme.text,fontSize:15}}/>
 <Text style={ui.caption}>{copy.recent}</Text>
 <FeatureActionButton title={busy?copy.deleting:copy.delete} disabled={busy||!confirmed} onPress={async()=>{
  if(!confirmed)return;setBusy(true);setError('');try{await deleteAccount();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>
 {error?<Text accessibilityRole="alert" style={ui.text}>{error}</Text>:null}</View>;
}
