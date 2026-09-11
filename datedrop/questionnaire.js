const values=['Adventure','Ambition','Courage','Creativity','Curiosity','Discipline','Fairness','Faith','Family','Freedom','Friendship','Honesty','Independence','Integrity','Kindness','Loyalty'];
let score=5,selected=new Set(['Curiosity','Creativity','Adventure']);
const scale=document.querySelector('.scale'),options=document.querySelector('.options');
for(let n=1;n<=7;n++){const b=document.createElement('button');b.textContent=n;b.setAttribute('aria-label',`${n} of 7`);b.onclick=()=>{score=n;update()};scale.append(b)}
for(const value of values){const b=document.createElement('button');b.textContent=value;b.onclick=()=>{if(selected.has(value))selected.delete(value);else if(selected.size<5)selected.add(value);else{document.querySelector('#values-status').textContent='最多选择 5 项，请先取消一项。';return}update()};options.append(b)}
function update(){[...scale.children].forEach((b,i)=>b.setAttribute('aria-pressed',score===i+1));[...options.children].forEach(b=>b.setAttribute('aria-pressed',selected.has(b.textContent)));document.querySelector('#scale-status').textContent=`已选择 ${score} / 7`;document.querySelector('#values-status').textContent=`已选 ${selected.size} / 5 项${selected.size===0?' · 请至少选择 1 项':''}`}
document.querySelector('#reset').onclick=()=>{score=5;selected=new Set(['Curiosity','Creativity','Adventure']);update()};update();
