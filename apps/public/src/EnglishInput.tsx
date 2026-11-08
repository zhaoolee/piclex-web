import {forwardRef,useRef,useState,type KeyboardEvent,type ClipboardEvent} from 'react';
type Field=HTMLInputElement|HTMLTextAreaElement;
type Props={value:string;onValue:(value:string,advance:boolean)=>void;onWarning:(show:boolean)=>void;onComposing?:(active:boolean)=>void;label:string;multiline?:boolean;className?:string;disabled?:boolean;readOnly?:boolean;virtualKeyboardOnly?:boolean;onVirtualKey?:(key:string)=>void;autoFocus?:boolean;maxLength?:number;placeholder?:string;onKeyDown?:(event:KeyboardEvent<Field>)=>void;onPaste?:(event:ClipboardEvent<Field>)=>void};
const needsEnglish=(text:string)=>/[\p{Script=Han}\u3000-\u303f\uff01-\uff60]/u.test(text);
/** Keep IME pre-edit text out of learning state and preserve the last English answer. */
const EnglishInput=forwardRef<Field,Props>(function EnglishInput({value,onValue,onWarning,onComposing,label,multiline=false,onKeyDown,onPaste,readOnly=false,virtualKeyboardOnly=true,onVirtualKey,...rest},ref){
 const composing=useRef(false),pendingCommit=useRef<string|null>(null),[draft,setDraft]=useState<string|null>(null);
 const accept=(text:string,advance:boolean)=>{if(needsEnglish(text)){onWarning(true);return;}onWarning(false);onValue(text,advance);};
 // readOnly is the OS-keyboard guard, including Safari. inputMode alone is only a hint.
 const attributes={...rest,readOnly:readOnly||virtualKeyboardOnly,inputMode:virtualKeyboardOnly?'none' as const:undefined,'aria-label':label,lang:'en',autoComplete:'off',autoCapitalize:'none',autoCorrect:'off',spellCheck:false,
  value:draft??value,
  ref:(node:Field|null)=>{if(typeof ref==='function')ref(node);else if(ref)ref.current=node;},
  onCompositionStart:(event:React.CompositionEvent<Field>)=>{composing.current=true;pendingCommit.current=null;setDraft(event.currentTarget.value);onWarning(true);onComposing?.(true);},
  onCompositionUpdate:()=>onWarning(true),
  onCompositionEnd:(event:React.CompositionEvent<Field>)=>{const text=event.currentTarget.value;composing.current=false;pendingCommit.current=text;setDraft(null);onComposing?.(false);if(needsEnglish(text)){onWarning(true);return;}onValue(text,false);},
  onChange:(event:React.ChangeEvent<Field>)=>{const text=event.currentTarget.value;if(composing.current||(event.nativeEvent as InputEvent).isComposing){setDraft(text);onWarning(true);return;}if(pendingCommit.current!==null&&(pendingCommit.current===text||value===text)){pendingCommit.current=null;return;}pendingCommit.current=null;setDraft(null);accept(text,true);},
  onPaste:(event:ClipboardEvent<Field>)=>{if(needsEnglish(event.clipboardData.getData('text'))){event.preventDefault();onWarning(true);return;}onWarning(false);if(readOnly){event.preventDefault();return;}onPaste?.(event);if(virtualKeyboardOnly&&!event.defaultPrevented){event.preventDefault();const field=event.currentTarget,text=event.clipboardData.getData('text');const next=value.slice(0,field.selectionStart??value.length)+text+value.slice(field.selectionEnd??value.length);accept(rest.maxLength?next.slice(0,rest.maxLength):next,true);}},
  onKeyDown:(event:KeyboardEvent<Field>)=>{
   // Protected fields never open an IME editor. Some hardware layouts still report
   // Process/229; recover only an unambiguous physical Latin key, never IME text.
   if(virtualKeyboardOnly&&!readOnly&&!composing.current&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&/^Key[A-Z]$/.test(event.code)&&(event.key==='Process'||event.key==='Unidentified'||event.keyCode===229)){
    event.preventDefault();event.stopPropagation();onWarning(false);onVirtualKey?.(event.shiftKey?event.code.slice(3):event.code.slice(3).toLowerCase());return;
   }
   if(composing.current||event.nativeEvent.isComposing||event.keyCode===229){onWarning(true);event.stopPropagation();return;}if(virtualKeyboardOnly&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
   event.preventDefault();const field=event.currentTarget,start=field.selectionStart??0,end=field.selectionEnd??start;
   const backward=field.selectionDirection==='backward',anchor=backward?end:start,caret=backward?start:end;
   const cursor=event.key==='Home'?0:event.key==='End'?value.length:event.key==='ArrowLeft'?Math.max(0,event.shiftKey?caret-1:start-(start===end?1:0)):Math.min(value.length,event.shiftKey?caret+1:end+(start===end?1:0));
   field.setSelectionRange(event.shiftKey?Math.min(anchor,cursor):cursor,event.shiftKey?Math.max(anchor,cursor):cursor,event.shiftKey&&cursor<anchor?'backward':'forward');return;
  }if(virtualKeyboardOnly&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&((event.key.length===1&&event.key!==' ')||event.key==='Backspace'||event.key==='Delete')){event.preventDefault();if(needsEnglish(event.key)){event.stopPropagation();onWarning(true);return;}onWarning(false);onVirtualKey?.(event.key);return;}onKeyDown?.(event);}
 };
 return multiline?<textarea {...attributes}/>:<input {...attributes}/>;
});
export default EnglishInput;
