import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
test('Every character sheet has 160 uniform transparent frames with actual art',()=>{
  for(const kind of ['swordsman','mage'])for(const palette of ['forest','ember','violet'])for(const skin of ['warm','deep','light']){
    const png=PNG.sync.read(readFileSync(`public/assets/${kind}-${palette}-${skin}.png`));assert.equal(png.width,256);assert.equal(png.height,640);
    for(let row=0;row<20;row++)for(let col=0;col<8;col++){
      let colored=0,transparent=0;const colors=new Set();
      for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=((row*32+y)*png.width+col*32+x)*4;if(png.data[i+3]){colored++;colors.add(png.data.subarray(i,i+3).toString('hex'));}else transparent++;}
      assert.ok(colored>80);assert.ok(transparent>400);assert.ok(colors.size>=5);
    }
  }
});
