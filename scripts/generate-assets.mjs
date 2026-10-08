import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = new URL('../public/assets/', import.meta.url);
mkdirSync(out, { recursive: true });
function canvas(w,h) {
  const png = new PNG({width:w,height:h}); png.data.fill(0);
  const pixel = (x,y,c) => { x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h||!c)return;
    const n=(y*w+x)*4; const v=parseInt(c.replace('#',''),16); png.data[n]=v>>16;png.data[n+1]=(v>>8)&255;png.data[n+2]=v&255;png.data[n+3]=255; };
  const rect=(x,y,rw,rh,c)=>{for(let j=0;j<rh;j++)for(let i=0;i<rw;i++)pixel(x+i,y+j,c);};
  const line=(x0,y0,x1,y1,c,width=1)=>{const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let i=0;i<=steps;i++)rect(Math.round(x0+(x1-x0)*i/(steps||1)),Math.round(y0+(y1-y0)*i/(steps||1)),width,width,c);};
  const poly=(points,c)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!=(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}if(inside)pixel(x,y,c);}};
  return {png,pixel,rect,line,poly,save(name){writeFileSync(new URL(name,out),PNG.sync.write(png));}};
}
const palettes={forest:['48654b','729367','a6b482'],ember:['853e38','bc6550','dd9670'],violet:['5c4778','8b6faa','b4a1cf']};
const skins={warm:['b97a53','e5b27e'],deep:['754b40','b87954'],light:['c6987d','f0ccaa']};
const swordDown=[
  '      hhhhh       ', '     hHHHHHh      ', '    hHHHLLHHh     ', '    hHLLLLLLh     ',
  '    hsssssssH     ', '     seesees      ', '     sSSSSSs      ', '      sSSs        ',
  '   oaaassaaao     ', '  oAALLALLAAAo    ', '  oALLLALLLAAo    ', '  oAALLALLAAAo    ',
  '   oaaaaaaaao     ', '   saaaaaaas      ', '   sBBgbBBBs      ', '    obbbbbbo      ',
  '    occcccco      ', '    ococcoCo      ', '    ococcoCo      ', '    ooo  ooo      ',
  '    obo  obo      ', '    ooo  ooo      ',
];
const mageDown=[
  '       ooo        ', '      odddo       ', '      odDdo       ', '     odDDddo      ',
  '    odDDDDddo     ', '   oddDDDDDddo    ', '   oLLgggLLLLo    ', '    osssssso      ',
  '     seeseo       ', '     sSSSSo       ', '   odddssdddo     ', '  odDDDgDDdddo    ',
  '  odDDdgDdddoo    ', '  sodddgdddoss    ', '   odddGdddo      ', '   odDDgDddo      ',
  '   odDDgDdddo     ', '  odDDdgDDdddo    ', '  odDDDgDDdddo    ', '  oLLLgggLLLLo    ',
  '   oooooooooo     ', '     oboobo       ',
];
for(const kind of ['swordsman','mage'])for(const [palette,colors]of Object.entries(palettes))for(const [skin,skinColors]of Object.entries(skins)){
  const sheet=canvas(32*8,32*20);
  const map={o:'222b31',h:'3e3535',H:'6b5342',L:'d9c394',s:skinColors[0],S:skinColors[1],e:'253038',
    a:'697c87',A:'a5b7bd',c:colors[0],C:colors[1],b:'443b32',B:'67533a',g:'b69757',G:'ebd499',d:colors[0],D:colors[1]};
  const actions=['idle','walk','attack','hurt','death'];
  for(let action=0;action<5;action++)for(let dir=0;dir<4;dir++)for(let frame=0;frame<8;frame++){
    const cell=canvas(32,32);const matrix=kind==='mage'?mageDown:swordDown;
    const walk=action===1?Math.round(Math.sin(frame*Math.PI/4)):0;
    const bob=action===0?(frame>=4?1:0):action===1?Math.abs(walk):0;
    for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix[y].length;x++){
      let ch=matrix[y][x];if(ch===' ')continue;
      if(dir===3&&y<8&&kind==='swordsman')ch=['s','S','e'].includes(ch)?'H':ch;
      if(dir===3&&y>=7&&y<10&&kind==='mage')ch=['s','S','e'].includes(ch)?'d':ch;
      if((dir===1||dir===2)&&ch==='e'&&x<(dir===1?8:7))ch='S';
      let px=x+7,py=y+5+bob;
      if(dir===1)px=Math.round(16+(px-16)*0.8);if(dir===2)px=32-Math.round(16+(px-16)*0.8);
      if(action===1&&y>=18)py+=x<9?walk:-walk;
      const color=action===3&&(frame===1||frame===3)?'f7e9cb':map[ch];
      cell.pixel(px,py,color);
    }
    // Clear silhouettes: sword, leather belt, shoulder plates / hood, embroidered robe, staff.
    if(kind==='swordsman'){
      const angle=action===2?-Math.PI+frame/7*Math.PI*1.8:dir===3?-1.8:0.65;
      const hx=dir===1?8:23,hy=19+bob;
      const ex=hx+Math.cos(angle)*9,ey=hy+Math.sin(angle)*10;
      cell.line(hx,hy,ex,ey,'26313b',2);cell.line(hx,hy,ex,ey,'cfddd8');
      cell.line(hx-2,hy+1,hx+2,hy-1,'b99a57');cell.rect(hx,hy+1,1,3,'67533a');
    }else{
      const hx=dir===1?5:25;const lean=action===2?Math.sin(frame/7*Math.PI)*4:0;
      cell.line(hx,27,hx-lean,12,'45392e',2);cell.line(hx,26,hx-lean,12,'bb9861');
      cell.rect(hx-1-lean,10,3,3,'b8ede0');cell.pixel(hx-lean,9,'eefbeb');cell.pixel(hx+1-lean,12,'68bdb2');
      if(action===2&&frame>2&&frame<6){cell.pixel(hx-lean-3,10,'b8ede0');cell.pixel(hx-lean+3,8,'b8ede0');}
    }
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const i=(y*32+x)*4;if(!cell.png.data[i+3])continue;
      let tx=x,ty=y;
      if(action===4){const angle=Math.min(1,frame/4)*Math.PI/2;tx=Math.round(16+(x-16)*Math.cos(angle)-(y-18)*Math.sin(angle));ty=Math.round(23+(x-16)*Math.sin(angle)+(y-18)*Math.cos(angle)*0.5);}
      const n=((action*4+dir)*32+ty)*sheet.png.width*4+(frame*32+tx)*4;
      if(tx>=0&&tx<32&&ty>=0&&ty<32)cell.png.data.copy(sheet.png.data,n,i,i+4);
    }
  }
  sheet.save(`${kind}-${palette}-${skin}.png`);
}
let seed=73612;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
for(const type of ['grass','path','water','stone']){
  const c=canvas(32,32);const colors={grass:['344e37','3c573c','405c3e','486442'],path:['8f8059','9c8b63','a99972','7b7252'],water:['305b5c','386969','407773','529087'],stone:['6e7664','79816c','8b9179','586459']}[type];
  c.rect(0,0,32,32,colors[0]);for(let i=0;i<65;i++)c.rect(Math.floor(rand()*32),Math.floor(rand()*32),type==='water'?5:2,1,colors[1+Math.floor(rand()*3)]);
  if(type==='stone'){c.line(0,16,32,16,colors[3]);c.line(16,0,16,15,colors[3]);c.line(8,17,8,32,colors[3]);}
  c.save(`${type}.png`);
}
const tree=canvas(64,88);
tree.poly([[5,75],[12,70],[48,70],[58,78],[48,82],[12,82]],'293f30');
tree.rect(28,49,9,28,'3e372b');tree.rect(31,47,4,29,'846943');tree.line(30,64,20,57,'655638',2);
const foliage=[[[6,41],[12,32],[10,24],[21,20],[19,12],[30,4],[41,9],[43,19],[53,24],[56,39],[62,49],[53,60],[41,64],[26,62],[15,58],[5,52]],'243e30'];
tree.poly(foliage[0],foliage[1]);
tree.poly([[9,40],[18,31],[15,26],[27,23],[25,14],[34,7],[39,18],[46,23],[53,39],[45,52],[31,53],[16,51]],'355c3b');
tree.poly([[13,35],[21,28],[21,21],[30,20],[29,12],[35,11],[37,25],[46,29],[46,37],[34,43],[22,42]],'4d7547');
for(let i=0;i<50;i++){const x=12+rand()*38,y=19+rand()*35;if(tree.png.data[(Math.floor(y)*64+Math.floor(x))*4+3])tree.rect(x,y,3,2,i%3?'547748':'638a50');}
tree.save('tree.png');
const house=canvas(128,128);
house.poly([[8,117],[22,106],[106,106],[125,119],[107,125],[19,123]],'293f30');
house.rect(22,50,84,64,'d0bc8c');house.rect(22,86,84,28,'baa479');
house.rect(23,60,5,56,'5a4835');house.rect(61,59,6,57,'5a4835');house.rect(101,60,5,56,'5a4835');house.rect(22,79,84,5,'71583b');
house.rect(36,64,14,14,'384746');house.rect(38,65,10,10,'78968a');house.rect(42,64,2,14,'d2b775');house.rect(36,69,14,2,'d2b775');
house.rect(79,89,16,25,'504533');house.rect(82,91,10,23,'7c6540');house.pixel(90,103,'d9c394');
house.poly([[7,58],[26,18],[94,18],[120,58],[109,65],[17,65]],'493d33');
house.poly([[12,55],[29,21],[91,21],[113,55]],'91644d');
for(let y=27;y<56;y+=7){house.line(27-(y-27)/2,y,95+(y-27)/2,y,'b0845c');for(let x=28;x<102;x+=12)house.line(x,y-5,x-2,y,'684c3e');}
house.rect(88,6,12,29,'777566');house.rect(86,6,16,4,'a4a18a');house.rect(88,18,12,2,'545a4c');house.rect(22,113,84,4,'847458');
house.save('house.png');
const rock=canvas(40,32);rock.poly([[2,26],[9,12],[16,5],[30,8],[37,21],[35,28],[14,30]],'4c594e');rock.poly([[8,24],[11,14],[19,8],[29,10],[33,21],[24,25]],'859080');rock.poly([[11,14],[19,8],[28,11],[25,17],[16,20]],'a1aa91');rock.line(23,17,29,23,'636f61');rock.save('rock.png');
const mine=canvas(96,72);mine.poly([[1,69],[6,40],[18,26],[32,10],[57,7],[77,23],[93,52],[95,69]],'4e594d');mine.poly([[8,60],[15,37],[38,16],[60,15],[82,41],[88,66]],'74806b');mine.poly([[27,66],[27,42],[35,30],[59,30],[69,41],[70,66]],'1e2b2a');mine.rect(24,35,6,33,'8c714e');mine.rect(67,35,6,33,'8c714e');mine.rect(24,30,49,7,'ad9062');mine.line(32,60,29,71,'aaa28b',2);mine.line(60,60,65,71,'aaa28b',2);mine.save('mine.png');
for(const mineral of ['feron','auralita']){const c=canvas(32,32);c.poly([[2,26],[5,16],[15,9],[24,14],[30,25],[20,29]],'535e52');const shades=mineral==='feron'?['8b8e89','ccd1b5','a6ae9a']:['668f9c','a2e3cf','6fb7ac'];for(const[x,y]of[[8,13],[16,8],[23,16]]){c.poly([[x-3,y+11],[x-4,y+3],[x,y],[x+3,y+4],[x+2,y+10]],shades[0]);c.line(x,y+2,x,y+9,shades[1]);c.pixel(x+1,y+7,shades[2]);}c.save(`${mineral}.png`);}
const fountain=canvas(64,64);fountain.poly([[5,38],[16,27],[47,27],[59,39],[55,52],[44,59],[19,59],[8,50]],'5b6f66');fountain.poly([[10,38],[21,30],[43,30],[54,38],[48,49],[19,49]],'759188');fountain.poly([[13,39],[23,33],[41,33],[50,39],[44,46],[21,46]],'457a76');fountain.rect(28,18,8,24,'a1ad90');fountain.rect(24,16,16,5,'c3c7a7');fountain.line(32,18,32,9,'a2d5bd',2);fountain.line(31,10,24,26,'87bca6');fountain.line(33,10,40,26,'87bca6');fountain.save('fountain.png');
const slime=canvas(32*4,32);for(let f=0;f<4;f++){const x=f*32,dy=f%2;slime.poly([[x+5,26],[x+4,19+dy],[x+8,12+dy],[x+15,9+dy],[x+24,13+dy],[x+28,21],[x+25,27],[x+10,29]],'293c36');slime.poly([[x+7,24],[x+7,17+dy],[x+15,12+dy],[x+23,16+dy],[x+25,24]],'779169');slime.rect(x+11,18+dy,2,3,'202f30');slime.rect(x+21,18+dy,2,3,'202f30');slime.rect(x+11,13+dy,5,2,'b3c29b');}slime.save('slime.png');
writeFileSync(new URL('sprites.json',out),JSON.stringify({cell:{width:32,height:32},columns:8,rows:20,directions:['down','left','right','up'],actions:['idle','walk','attack','hurt','death'],fps:{idle:5,walk:10,attack:18,hurt:16,death:10},license:'Original procedural pixel art. Project license: MIT.'},null,2));
console.log('Generated 18 character sheets, tiles and original medieval props.');
