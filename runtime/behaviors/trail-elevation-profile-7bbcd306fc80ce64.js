export default async function install(app) {
 const [ElevationProfile,ElevationLayer,Graphic,Point,reactiveUtils] = await Promise.all([app.import('esri/widgets/ElevationProfile'),app.import('esri/layers/ElevationLayer'),app.import('esri/Graphic'),app.import('esri/geometry/Point'),app.import('esri/core/reactiveUtils')]);
 const mount=app.getMount('trail-elevation-profile');
 mount.style.cssText='display:flex;flex-direction:column;min-width:0;height:100%;overflow:hidden;margin-inline:-12px;width:calc(100% + 24px);max-width:none;';
 const heading=document.createElement('div');
 heading.style.cssText='padding:2px 4px;font:600 13px/18px sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto;';
 const readout=document.createElement('div');
 readout.style.cssText='padding:1px 4px;font:13px/18px sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto;color:var(--calcite-color-text-1);';
 const area=document.createElement('div');area.style.cssText='position:relative;flex:1 1 auto;min-height:0;min-width:0;';
 const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100%;height:100%;cursor:crosshair;';canvas.tabIndex=0;canvas.setAttribute('aria-label','Trail elevation profile. Move the pointer to read sampled elevation and distance. Arrow keys move along the profile.');area.append(canvas);
 const engine=document.createElement('div');engine.style.display='none';
 mount.replaceChildren(heading,readout,area,engine);
 const elevation=new ElevationLayer({portalItem:{id:app.config.elevationItemId}});
 const widget=new ElevationProfile({view:app.view,container:engine,unit:'meters',profiles:[{type:'query',source:elevation,title:'Ground elevation',viewVisualizationEnabled:false}],visibleElements:{chart:false,legend:false,sketchButton:false,selectButton:false,settingsButton:false,clearButton:false,unitSelector:false,uniformChartScalingToggle:false}});
 const marker=await app.createResultLayer({id:'elevation-hover-marker',title:'Profile hover location',geometryType:'point',renderer:{type:'simple',symbol:{type:'simple-marker',style:'circle',size:13,color:[0,122,255,1],outline:{color:[255,255,255,1],width:2.5}}}});
 let samples=[],active=null,trailName=null,generation=0,disposed=false,plot=null,queue=Promise.resolve(),lastResult=null;
 const idle=()=>trailName?'Move over the profile to read elevation and distance.':'Select a trail on the map.';
 heading.textContent='Elevation profile';readout.textContent=idle();
 function draw(){
  const rect=area.getBoundingClientRect(),w=rect.width,h=rect.height;if(w<1||h<1)return;
  const dpr=window.devicePixelRatio||1;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.font='11px sans-serif';
  const valid=samples.filter(s=>Number.isFinite(s.elevation));if(!valid.length){plot=null;c.fillStyle='#58616b';c.fillText(trailName?'Loading elevation samples…':'Select a trail to display its profile.',12,28);return;}
  const lo=Math.min(...valid.map(s=>s.elevation)),hi=Math.max(...valid.map(s=>s.elevation)),pad=Math.max((hi-lo)*0.08,1);
  plot={left:55,right:w-12,top:12,bottom:h-27,min:lo-pad,max:hi+pad,start:samples[0].distance,end:samples[samples.length-1].distance};
  if(plot.right<=plot.left||plot.bottom<=plot.top)return;
  const px=s=>plot.left+(s.distance-plot.start)/(plot.end-plot.start||1)*(plot.right-plot.left);
  const py=s=>plot.bottom-(s.elevation-plot.min)/(plot.max-plot.min)*(plot.bottom-plot.top);
  c.textAlign='right';for(let i=0;i<=3;i++){const e=plot.min+(plot.max-plot.min)*i/3,y=plot.bottom-(plot.bottom-plot.top)*i/3;c.strokeStyle='#dfe5e9';c.beginPath();c.moveTo(plot.left,y);c.lineTo(plot.right,y);c.stroke();c.fillStyle='#42505d';c.fillText(Math.round(e)+' m',plot.left-5,y+4);}
  c.textAlign='center';for(let i=0;i<=4;i++){const x=plot.left+(plot.right-plot.left)*i/4,d=plot.start+(plot.end-plot.start)*i/4;c.fillStyle='#42505d';c.fillText((d/1000).toFixed(1)+' km',x,h-7);}
  c.strokeStyle='#238a74';c.lineWidth=2;c.beginPath();let connected=false;for(const s of samples){if(!Number.isFinite(s.elevation)){connected=false;continue;}if(connected)c.lineTo(px(s),py(s));else c.moveTo(px(s),py(s));connected=true;}c.stroke();
  if(active){const x=px(active);c.strokeStyle='#007aff';c.lineWidth=1;c.beginPath();c.moveTo(x,plot.top);c.lineTo(x,plot.bottom);c.stroke();if(Number.isFinite(active.elevation)){c.fillStyle='#007aff';c.beginPath();c.arc(x,py(active),4,0,Math.PI*2);c.fill();}}
 }
 function setSample(s){
  active=s;const point=s?new Point({x:s.x,y:s.y,spatialReference:app.view.spatialReference}):null;
  const text=s?(Number.isFinite(s.elevation)?'Elevation: '+s.elevation.toFixed(1)+' m':'Elevation: no data')+' · Distance: '+(s.distance/1000).toFixed(2)+' km · '+point.latitude.toFixed(6)+', '+point.longitude.toFixed(6):idle();
  readout.textContent=text;readout.title=text;draw();
  lastResult={shown:!!s,elevationMeters:s?.elevation??null,distanceMeters:s?.distance??null,readout:text,point:point?.toJSON()??null};
  queue=queue.catch(()=>{}).then(async()=>{if(disposed)return;await marker.replaceFeatures(point?[{geometry:point,attributes:{}}]:[]);});queue.catch(e=>app.reportError(e));
  return lastResult;
 }
 function sampleAtDistance(distance){let lo=0,hi=samples.length-1;while(lo<hi){const m=Math.floor((lo+hi)/2);if(samples[m].distance<distance)lo=m+1;else hi=m;}if(lo>0&&Math.abs(samples[lo-1].distance-distance)<Math.abs(samples[lo].distance-distance))lo--;return samples[lo];}
 function move(event){if(!plot||!samples.length)return;const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;if(x<plot.left||x>plot.right||y<plot.top||y>plot.bottom){setSample(null);return;}setSample(sampleAtDistance(plot.start+(x-plot.left)/(plot.right-plot.left)*(plot.end-plot.start)));}
 function leave(){setSample(null);}
 function key(event){if(event.key==='Escape'){leave();return;}if(!['ArrowLeft','ArrowRight'].includes(event.key)||!samples.length)return;event.preventDefault();const index=active?samples.indexOf(active):0;setSample(samples[Math.max(0,Math.min(samples.length-1,index+(event.key==='ArrowRight'?1:-1)))]);}
 canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('keydown',key);canvas.addEventListener('blur',leave);
 const resize=new ResizeObserver(draw);resize.observe(area);
 const handle=reactiveUtils.watch(()=>widget.profiles.getItemAt(0)?.samples,list=>{samples=(list??[]).filter(s=>Number.isFinite(s.distance)&&Number.isFinite(s.x)&&Number.isFinite(s.y));if(active)setSample(sampleAtDistance(active.distance));else draw();},{initial:true});
 async function ready(){await reactiveUtils.whenOnce(()=>widget.profiles.getItemAt(0)?.progress===1&&widget.profiles.getItemAt(0)?.samples?.length>0);samples=widget.profiles.getItemAt(0).samples.filter(s=>Number.isFinite(s.distance)&&Number.isFinite(s.x)&&Number.isFinite(s.y));draw();}
 app.actions.register('profile-selected-trail',async({graphic,selection})=>{const mine=++generation;trailName=null;samples=[];setSample(null);heading.textContent='Elevation profile · Loading trail…';widget.input=null;try{const layer=app.layers[selection.layerId];app.assert(layer,'Trail layer unavailable');const {features}=await layer.queryFeatures({objectIds:[graphic.getObjectId()],returnGeometry:true,outFields:['*']});if(mine!==generation)return {stale:true};const feature=features[0];app.assert(feature?.geometry?.type==='polyline','Selected trail has no line geometry');await elevation.load();if(mine!==generation)return {stale:true};trailName=String(feature.attributes.name??feature.attributes.Name??layer.title);widget.input=new Graphic({geometry:feature.geometry});heading.textContent='Elevation profile · '+trailName;readout.textContent=idle();draw();return {trail:trailName,inputReady:true};}catch(error){heading.textContent='Elevation profile · Unable to load';readout.textContent=String(error);return {error:String(error)};}});
 app.actions.register('profile-highest-sample',async()=>{await ready();const valid=samples.filter(s=>Number.isFinite(s.elevation));app.assert(valid.length,'No elevation samples');const p=valid.reduce((a,b)=>b.elevation>a.elevation?b:a);return {trail:trailName,elevation:p.elevation,distance:p.distance,units:'meters',point:{x:p.x,y:p.y,spatialReference:app.view.spatialReference.toJSON()},sampleCount:samples.length};});
 app.actions.register('test-profile-pointer-events',async()=>{await ready();app.assert(plot&&plot.right>plot.left,'Chart has no rendered area');const r=canvas.getBoundingClientRect(),results=[];for(const fraction of [0.2,0.5,0.8]){canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+plot.left+fraction*(plot.right-plot.left),clientY:r.top+(plot.top+plot.bottom)/2,bubbles:true}));await queue;results.push({...lastResult,markerCount:await marker.layer.queryFeatureCount()});}canvas.dispatchEvent(new PointerEvent('pointerleave'));await queue;return {eventType:'synthetic pointermove and pointerleave on the displayed canvas',trail:trailName,sampleCount:samples.length,results,cleared:{...lastResult,markerCount:await marker.layer.queryFeatureCount()}};});
 app.onCleanup(()=>{disposed=true;generation++;resize.disconnect();handle.remove();canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('keydown',key);canvas.removeEventListener('blur',leave);widget.destroy();mount.replaceChildren();});
}