import {useEffect,useRef,useId,type ReactNode} from 'react';
import {NativeIcon as Icon} from '../../../packages/learning-ui/src/NativeIcon';
export default function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
 const titleID=useId();const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const focused=document.activeElement as HTMLElement;dialog.current?.showModal();return()=>{dialog.current?.close();focused?.focus({preventScroll:true});};},[]);
 return <dialog ref={dialog} className="learning-dialog" aria-labelledby={titleID} onCancel={e=>{e.preventDefault();e.stopPropagation();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}><div className="dialog-body"><header><h2 id={titleID}>{title}</h2><button autoFocus aria-label="关闭" onClick={close}><Icon name="close"/></button></header>{children}</div></dialog>;
}
