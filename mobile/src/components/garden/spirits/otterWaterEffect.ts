// Water-spirit material on the existing 304 x 180 otter animation cells.
// Face and flower details are protected. Effects stay inside the existing
// 80-world-unit clearance envelope, and share the otter's world occlusion mask.
export const OTTER_WATER_RECT = { x: -12, y: 0, width: 316, height: 180 };
export const OTTER_WATER_SHADER = `
uniform shader atlas;
uniform float frame;
uniform float seconds;
uniform float motion;
uniform float bend;

float bell(float x) { return exp(-x*x); }
float tailRegion(float2 p) {
  float lower=mix(150.0,110.0,smoothstep(42.0,70.0,p.x));
  return (1.0-smoothstep(80.0,94.0,p.x))*(1.0-smoothstep(lower,lower+24.0,p.y));
}
half4 original(float2 p) {
  if(p.x<0.0 || p.x>=304.0 || p.y<0.0 || p.y>=180.0) return half4(0);
  float2 cell=float2(mod(frame,10.0)*304.0,floor(frame/10.0)*180.0);
  return atlas.eval(cell+clamp(p,float2(0.5),float2(303.5,179.5)));
}
half4 main(float2 p) {
  half4 untouched=original(p);
  float tail=tailRegion(p);
  float reach=smoothstep(12.0,68.0,length((p-float2(84.0,113.0))*float2(1.0,1.1)));
  // Warm petals remain painted flowers, rather than dissolving with the tail.
  float petals=smoothstep(0.02,0.10,max(float(untouched.r-untouched.g),float(untouched.r-untouched.b)));
  petals*=smoothstep(70.0,82.0,p.x)*smoothstep(88.0,104.0,p.y);
  float dissolve=tail*reach*(1.0-petals);
  float2 source=p-float2(0.0,2.3*sin(seconds*1.4+(84.0-p.x)*0.035)*dissolve*motion);
  half3 painted=original(source).rgb;
  float face=smoothstep(188.0,216.0,p.x)*(1.0-smoothstep(112.0,134.0,p.y));
  float warm=smoothstep(0.015,0.10,max(float(untouched.r-untouched.g),float(untouched.r-untouched.b)));
  float ivory=smoothstep(0.70,0.87,float(min(untouched.r,min(untouched.g,untouched.b))));
  float flowerArea=smoothstep(70.0,96.0,p.x)*(1.0-smoothstep(205.0,222.0,p.x))
    *(1.0-smoothstep(148.0,164.0,p.y));
  float details=max(face,max(warm,ivory)*flowerArea);
  float upper=1.0-smoothstep(78.0,108.0,p.y);
  float submerged=smoothstep(100.0,158.0,p.y+2.0*sin(p.x*0.045-seconds*0.9));
  float cyan=smoothstep(0.04,0.22,float((untouched.g+untouched.b)*0.5-untouched.r));
  half3 n0=original(p+float2(2.0,0.0)).rgb,n1=original(p-float2(2.0,0.0)).rgb;
  half3 n2=original(p+float2(0.0,2.0)).rgb,n3=original(p-float2(0.0,2.0)).rgb;
  float neighbor=min(min(float((n0.g+n0.b)*0.5),float((n1.g+n1.b)*0.5)),
    min(float((n2.g+n2.b)*0.5),float((n3.g+n3.b)*0.5)));
  float rim=smoothstep(0.04,0.22,float((untouched.g+untouched.b)*0.5)-neighbor);
  // Selective transmission, not a uniform opacity reduction. Keep facial and
  // petal RGB; let the lake show through the underside and bright cyan rim.
  float attenuation=0.14*(1.0-upper)+0.38*submerged+0.40*rim*cyan*(1.0-upper*0.65);
  float transmit=1.0-min(0.72,attenuation)*(1.0-details);
  half3 body=painted*transmit*(1.0-dissolve);
  float inside=smoothstep(0.15,0.65,float(max(painted.r,max(painted.g,painted.b))))
    *(1.0-rim)*submerged*(1.0-details);
  float current=0.045+0.035*sin(p.x*0.085+p.y*0.15-seconds*0.85+bend*0.6);
  body*=1.0-inside*current;
  body=mix(body,body*half3(0.64,0.83,1.0),submerged*0.22*(1.0-details));

  float t=(84.0-p.x)/86.0;
  float envelope=smoothstep(0.0,0.14,t)*(1.0-smoothstep(0.72,1.04,t));
  float center=116.0-8.0*t+6.0*t*sin(1.6*t-seconds*1.15)+bend*12.0*t*t;
  float energy=(0.35+0.65*motion)*envelope;
  float broad=bell((p.y-center)/(5.5+3.0*t))*0.090;
  float strand=bell((p.y-center-8.0*sin(t*5.0-seconds*1.1))/(1.3+0.8*t))*0.17;
  float strand2=bell((p.y-center+7.0+6.0*sin(t*5.0-seconds*0.85))/(1.8+0.5*t))*0.090;
  float strand3=bell((p.y-center-8.0-5.5*sin(t*4.5-seconds*0.95))/2.0)*0.060;
  float flow=(broad+strand+strand2+strand3)*energy;
  half3 water=half3(0.40,0.76,0.91)*flow;

  // Two soft, broken surface rings at the tail, with zero energy on wrap.
  for(int i=0;i<2;i++) {
    float phase=fract(seconds*0.24+float(i)*0.5);
    float r=12.0+phase*25.0;
    float2 q=(p-float2(62.0,124.0))*float2(1.0,2.8);
    float ring=bell((length(q)-r)/1.45);
    float life=sin(phase*3.14159265);
    float arc=0.4+0.6*bell((p.y-128.0)/6.0);
    water+=half3(0.28,0.62,0.77)*ring*life*arc*0.055*motion;
  }
  for(int i=0;i<4;i++) {
    float phase=fract(seconds*0.18+float(i)*0.271);
    float life=smoothstep(0.0,0.16,phase)*(1.0-smoothstep(0.45,1.0,phase));
    float x=72.0-phase*62.0+4.0*sin(float(i)*2.3);
    float y=104.0+10.0*sin(float(i)*2.7+phase*3.0)+bend*8.0*phase;
    float2 q=p-float2(x,y);
    float spark=exp(-dot(q,q)/1.4)+0.15*exp(-dot(q,q)/9.0);
    water+=half3(0.38,0.78,0.95)*spark*life*0.19*motion;
  }
  float rear=(1.0-smoothstep(86.0,94.0,p.x));
  // The complete wake stays inside the existing 80-world-unit body envelope:
  // the unchanged navigation clearance continues to cover every visible pixel.
  float radial=1.0-smoothstep(73.0,79.0,length((p-float2(152.0,99.0))*(150.0/304.0)));
  water*=rear*radial*(1.0-smoothstep(130.0,145.0,p.y))*(1.0-petals);
  // Surface light and low, receding displacement arcs belong to the same
  // stroke phase as the body. They stay localized and inside the water clearance.
  float halo=bell((p.x-160.0)/78.0)*bell((p.y-145.0)/13.0)*0.032;
  float u=(p.x-75.0)/180.0;
  float contact=smoothstep(0.0,0.12,u)*(1.0-smoothstep(0.82,1.0,u));
  float displacement=bell((p.y-142.0-3.0*sin(u*4.0-seconds*0.7))/1.6)*contact*0.035;
  float surface=halo+displacement;
  for(int i=0;i<2;i++) {
    float phase=fract(seconds*0.22+float(i)*0.5);
    float2 q=(p-float2(162.0-phase*27.0*motion,143.0))*float2(1.0,3.45);
    float radius=48.0+phase*34.0;
    surface+=bell((length(q)-radius)/1.55)*sin(phase*3.14159265)
      *(0.35+0.65*bell((p.y-148.0)/7.0))*0.035;
  }
  half3 surfaceWater=half3(0.25,0.53,0.79)*surface*(0.4+0.6*motion)*radial*(1.0-details);
  half3 rgb=clamp(body+water+surfaceWater,half3(0),half3(1));
  // Valid premultiplied alpha: black atlas pixels become genuinely transparent.
  // Premultiplied screen preserves the original painted RGB and blue glow.
  return half4(rgb,max(rgb.r,max(rgb.g,rgb.b)));
}
`;

