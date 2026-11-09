// Original bitmap assets generated with Codex image_gen; prompts live beside the images.
export const artwork = {};
export function loadArtwork(redraw,progress=()=>{}) {
  const assets=[
    ['achievementIcons','./assets/generated-v208/achievements.webp'],
    ['classIcons','./assets/generated-v208/classes.webp'],
    ['hero','./assets/hero.webp'],
    ['items','./assets/items.webp'],
    ['coin','./assets/coin.webp'],
    ['enemies','./assets/enemies.webp'],
    ['enemyVariants','./assets/generated-v210/enemies.webp'],
    ['weaponIcons','./assets/generated-v204/weapons.webp'],
    ['shopIcons','./assets/generated-v204/shop.webp'],
    ['worldProps','./assets/generated-v204/world.webp'],
    ['combatFx','./assets/generated-v205/combat-fx.webp'],
    ['heroSheet','./assets/sprites/hero/spritesheet.png'],
    ['blobSheet','./assets/sprites/blob/spritesheet.png'],
    ['runnerSheet','./assets/sprites/runner/spritesheet.png'],
    ['tankSheet','./assets/sprites/tank/spritesheet.png'],
  ];
  let loaded=0;progress(0,assets.length);
  return Promise.all(assets.map(([name,path])=>new Promise(resolve=>{
    const image=new Image();let settled=false;
    const finish=success=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=image.onerror=null;if(success){artwork[name]=image;redraw();}progress(++loaded,assets.length);resolve(success);};
    const timer=setTimeout(()=>finish(false),120000);
    image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=path;
  })));

}
const indices = {pea:0,fork:1,scatter:2,damage:3,health:4,speed:5,armor:6,magnet:7,haste:8,regen:9};
const weaponIds=['smg','knife','stick','fist','slingshot','laser','crossbow','lightning_shiv','shredder','minigun','ghost_axe','ghost_flint'];
const shopIds=['coffee','cake','helmet','plant','lens','glasses','bat','fertilizer','lemonade','weird_food','coupon','mushroom','lost_duck','scar','leather_vest','metal_plate','wheelbarrow','sunglasses','glass_cannon','warrior_helmet','exoskeleton','medal'];
const upgradeIndices={stat_max_hp:0,stat_hp_regeneration:1,stat_lifesteal:2,stat_percent_damage:3,stat_melee_damage:4,stat_ranged_damage:5,stat_elemental_damage:6,stat_attack_speed:7,stat_crit_chance:8,stat_range:9,stat_armor:10,stat_dodge:11,stat_speed:12,stat_luck:13,stat_harvesting:14};
export const worldIds=['tree','stump','material','fruit','crate','legendary'];
const achievementIds=['potato','night_goggles','power_fist','trophy'];
const classIds=['chopper','wand','medical_gun','thunder_sword','snake','scared_sausage','medikit','multitasker'];
export function itemTile(id){
  id=({doctor:'medikit',mage:'wand',engineer:'wrench',well_rounded:'potato',brawler:'power_fist',ranger:'night_goggles',wrench:'stick'}[id]||id);
  if(achievementIds.includes(id))return {name:'achievementIcons',file:'generated-v208/achievements.webp',index:achievementIds.indexOf(id),columns:4,rows:1};
  if(classIds.includes(id))return {name:'classIcons',file:'generated-v208/classes.webp',index:classIds.indexOf(id),columns:4,rows:2};
  if(weaponIds.includes(id))return {name:'weaponIcons',file:'generated-v204/weapons.webp',index:weaponIds.indexOf(id),columns:4,rows:3};
  if(shopIds.includes(id))return {name:'shopIcons',file:'generated-v204/shop.webp',index:shopIds.indexOf(id),columns:4,rows:6};
  if(id in indices)return {name:'items',file:'items.webp',index:indices[id],columns:4,rows:3};
  return null;
}
export function itemArt(id) {
  const tile=itemTile(id);if(!tile)return '';
  return `<span class="item-art" aria-hidden="true" style="background-image:url(./assets/${tile.file});background-size:${tile.columns*100}% ${tile.rows*100}%;--item-x:${tile.index%tile.columns/(tile.columns-1)*100}%;--item-y:${(tile.rows===1?0:Math.floor(tile.index/tile.columns)/(tile.rows-1)*100)}%"></span>`;
}
export function upgradeArt(statKey) {
  const index=upgradeIndices[statKey],columns=4,rows=4;if(!Number.isInteger(index))return '';
  return `<span class="upgrade-art" aria-hidden="true" style="background-image:url(./assets/generated-v205/upgrades.webp);background-size:${columns*100}% ${rows*100}%;--upgrade-x:${index%columns/(columns-1)*100}%;--upgrade-y:${Math.floor(index/columns)/(rows-1)*100}%"></span>`;
}
export const coinArt = '<span class="coin-art" aria-hidden="true"></span>';
export function drawItem(ctx, id, x, y, size) {
  const tile=itemTile(id),image=tile&&artwork[tile.name];if(!image)return false;
  const w=image.naturalWidth/tile.columns,h=image.naturalHeight/tile.rows;
  ctx.drawImage(image,tile.index%tile.columns*w,Math.floor(tile.index/tile.columns)*h,w,h,x-size/2,y-size/2,size,size);
  return true;
}
export function drawProp(ctx,id,x,y,size){
  const image=artwork.worldProps,index=worldIds.indexOf(id);if(!image||index<0)return false;
  // The generated tree's roots extend slightly outside its nominal 512px cell.
  // Its isolated 576px source rectangle includes the whole tree, with no other prop.
  if(id==='tree'){ctx.drawImage(image,0,0,image.naturalWidth*.375,image.naturalWidth*.375,x-size/2,y-size/2,size,size);return true;}
  const w=image.naturalWidth/3,h=image.naturalHeight/2;
  ctx.drawImage(image,index%3*w,Math.floor(index/3)*h,w,h,x-size/2,y-size/2,size,size);return true;
}
export function drawEnemy(ctx, type, x, y, size) {
  const image = artwork.enemies;if(!image)return false;
  const index={blob:0,runner:1,tank:2}[type]??0,w=image.naturalWidth/3,h=image.naturalHeight;
  ctx.drawImage(image,index*w,0,w,h,x-size/2,y-size*.6,size,size*1.2);
  return true;
}
