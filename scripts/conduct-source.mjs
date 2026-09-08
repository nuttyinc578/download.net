// Minimal safe renderer for the headings, paragraphs, bullets and links in the pinned covenant.
export function renderConduct(markdown) {
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const references=new Map();
  const text=markdown.replace(/^\[([^\]]+)\]:\s*(https:\/\/\S+)\s*$/gm,(_,key,url)=>{references.set(key.toLowerCase(),url);return '';});
  function inline(value) {
    let result='',offset=0;
    const tokens=/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)|\[([^\]]+)\]\[([^\]]+)\]|\*\*([^*]+)\*\*/g;
    for(const match of value.matchAll(tokens)) {
      result+=escape(value.slice(offset,match.index));
      if(match[5])result+='<strong>'+escape(match[5])+'</strong>';
      else {
        const target=match[2]||references.get(match[4].toLowerCase());
        if(!target)throw Error('Unresolved covenant link: '+match[4]);
        const url=new URL(target);
        if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid covenant link.');
        result+='<a class="text-link" href="'+escape(url.href)+'">'+escape(match[1]||match[3])+'</a>';
      }
      offset=match.index+match[0].length;
    }
    return result+escape(value.slice(offset));
  }
  return text.trim().split(/\n\s*\n/).map(block=>{
    const heading=block.match(/^(#{1,6}) (.+)$/);
    if(heading){if(heading[1].length===1)return '';const tag='h'+heading[1].length;return '<'+tag+'>'+inline(heading[2])+'</'+tag+'>';}
    const lines=block.split('\n');
    if(lines.every(line=>line.startsWith('* ')))return '<ul>'+lines.map(line=>'<li>'+inline(line.slice(2))+'</li>').join('')+'</ul>';
    return '<p>'+inline(lines.join(' '))+'</p>';
  }).join('\n');
}
