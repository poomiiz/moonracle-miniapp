const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function element(tag,text,cls){return {tag,text,cls,children:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}};}
const view=element('div');let seed;
const context={URL,console,view,el:element,current:'news',renderTabs(){},newTask(value){seed=value},popup(){},fail(e){throw e},
  api:async()=>({refresh_interval_seconds:300,content_pipeline:{posts:[{pipeline:true,category:'ai',headline:'พร้อมอ่าน',status:'published',language:'th',caption:'ข้อความข่าว',post_url:'https://facebook.com/example',primary_url:'https://example.com'}],analyses:[{source:{title:'วิเคราะห์',category:'ข่าว AI',url:'https://example.com'},score:85,reference_sufficiency:'partial',evidence_gaps:['ราคาไม่ยืนยัน']}]},digest:{metadata:{items:[]}}})};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/kb-news.js','utf8'),context);
assert.equal(context.newsLink('javascript:alert(1)','bad').tag,'span');
assert.equal(context.newsLink('https://secret@example.com','bad').tag,'span');
assert.equal(context.newsLink('https://example.com','ต้นทาง').rel,'noopener noreferrer');
const buttons=context.newsActions({title:'ข่าว',url:'https://example.com'}).children;
buttons[1].onclick();assert.equal(context.current,'new');assert.match(seed.description,/https:\/\/example.com/);assert.match(seed.title,/เช็คเพิ่ม/);
context.current='news';
context.news().then(()=>{
  const text=JSON.stringify(view.children);
  assert.match(text,/โพสต์แล้ว/);assert.match(text,/มีบางส่วน ต้องตรวจเพิ่ม/);assert.match(text,/ราคาไม่ยืนยัน/);
  assert.match(text,/เปิดโพสต์จริง/);console.log('News Mini App checks passed');
}).catch(e=>{console.error(e);process.exitCode=1});
