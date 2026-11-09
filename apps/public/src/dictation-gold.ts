// A row uses a single clipped gradient and halo across its measured glyphs.
// Animating a filtered layer per letter is noticeably more expensive on long sentences.
function mirrorGuidedRows(board:Element,glyphs:HTMLElement[]){
 const origin=board.getBoundingClientRect(),font=getComputedStyle(glyphs[0]).font;
 const rows=new Map<number,{rect:DOMRect;character:string}[]>();
 for(const glyph of glyphs){
  const rect=glyph.getBoundingClientRect();
  let row=rows.get(rect.top);
  if(!row){row=[];rows.set(rect.top,row);}
  row.push({rect,character:glyph.textContent||''});
 }
 return [...rows.values()].map(row=>{
  row.sort((a,b)=>a.rect.left-b.rect.left);
  const first=row[0].rect,last=row[row.length-1].rect;
  const mirror=document.createElement('span');
  mirror.className='dictation-gold-mirror dictation-gold-row dictation-gold-text';
  mirror.setAttribute('aria-hidden','true');
  Object.assign(mirror.style,{left:`${first.left-origin.left}px`,top:`${first.top-origin.top}px`,width:`${last.right-first.left}px`,font});
  let edge=first.left;
  for(const {rect,character} of row){
   const letter=document.createElement('span');
   letter.className='dictation-gold-letter';letter.textContent=character;
   letter.style.width=`${rect.width}px`;letter.style.marginLeft=`${rect.left-edge}px`;
   mirror.append(letter);edge=rect.right;
  }
  return {mirror,text:mirror};
 });
}

// Native inputs and textareas need an aria-hidden text copy so the same sweep
// can follow their scrolling and wrap at the same positions.
function mirrorText(field:HTMLInputElement|HTMLTextAreaElement){
 const mirror=document.createElement('span'),text=document.createElement('span'),style=getComputedStyle(field);
 mirror.className='dictation-gold-mirror';mirror.setAttribute('aria-hidden','true');
 Object.assign(mirror.style,{
  left:`${field.offsetLeft+field.clientLeft}px`,top:`${field.offsetTop+field.clientTop}px`,
  width:`${field.clientWidth}px`,height:`${field.clientHeight}px`,
  padding:style.padding,font:style.font,letterSpacing:style.letterSpacing,textIndent:style.textIndent,
  whiteSpace:field instanceof HTMLTextAreaElement?'pre-wrap':'pre',
 });
 text.className='dictation-gold-text';text.textContent=field.value;mirror.append(text);
 return {field,mirror,text,left:field.scrollLeft,top:field.scrollTop};
}

export function startDictationGoldSweep(board:Element){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 if(reduced.matches||document.hidden)return;
 const glyphs=[...board.querySelectorAll<HTMLElement>('.guided-letters .letter-glyph')].filter(glyph=>glyph.textContent?.trim());
 const rows=glyphs.length?mirrorGuidedRows(board,glyphs):[];
 const fields=rows.length?[]:[...board.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')].filter(field=>field.value).map(mirrorText);
 for(const {mirror} of rows)board.append(mirror);
 for(const {field,mirror,left,top} of fields){field.after(mirror);mirror.scrollLeft=left;mirror.scrollTop=top;}
 const mirrors=[...rows,...fields];
 if(!mirrors.length)return;
 const range=document.createRange();
 const bounds=mirrors.map(({text:node})=>{
  range.selectNodeContents(node);
  const {left,right}=range.getBoundingClientRect();
  return {node,left,right};
 });
 const origin=Math.min(...bounds.map(({left})=>left)),width=Math.max(...bounds.map(({right})=>right))-origin;
 for(const {node,left} of bounds){
  node.style.setProperty('--gold-word',`${width}px`);
  node.style.setProperty('--gold-offset',`${left-origin}px`);
 }
 board.classList.add('gold-sweep');
 const timeout=setTimeout(cancel,1040);
 reduced.addEventListener('change',cancel);
 window.addEventListener('pagehide',cancel);
 function cancel(){
  clearTimeout(timeout);reduced.removeEventListener('change',cancel);window.removeEventListener('pagehide',cancel);
  board.classList.remove('gold-sweep');
  for(const {mirror} of mirrors)mirror.remove();
 }
 return cancel;
}
