// Fixed-size screen labels stay readable while the radar zooms.
export function wrapLabel(text,measure,maxWidth=174){
  const lines=[];let line='';
  for(const word of text.split(/\s+/)){const next=line?`${line} ${word}`:word;if(line&&measure(next)>maxWidth){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);return lines;
}
export function placeLabel(x,y,w,h,width,height,occupied){
  const overlap=b=>occupied.reduce((sum,a)=>sum+Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1])),0);
  let best,score=Infinity;
  for(let radius=18;radius<Math.max(width,height);radius+=28)for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,b=[Math.max(3,Math.min(width-w-3,x+Math.cos(angle)*radius-w/2)),Math.max(3,Math.min(height-h-3,y+Math.sin(angle)*radius-h/2)),w,h];
    const cost=overlap(b)*10000+Math.hypot(b[0]+w/2-x,b[1]+h/2-y);
    if(cost<score){score=cost;best=b;}
    if(overlap(b)===0){occupied.push(b);return b;}
  }
  occupied.push(best);return best;
}
