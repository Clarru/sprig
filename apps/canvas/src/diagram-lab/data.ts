import { UsersThreeIcon, PaperPlaneTiltIcon, ClockIcon, EnvelopeOpenIcon, MapPinIcon, CompassIcon, NavigationArrowIcon, FlagIcon, LockKeyIcon, BroadcastIcon, HandPalmIcon, XCircleIcon, SparkleIcon } from '@phosphor-icons/react';
export const nodes = [
 {id:'problem',title:'Find friends at a festival',detail:'People get separated. Group chats get noisy.',type:'intent',icon:UsersThreeIcon},
 {id:'audience',title:'Choose friends',detail:'Select the people who receive the invitation.',type:'action',icon:UsersThreeIcon},
 {id:'solution',title:'Share a meeting point',detail:'Choose a spot and send it to friends.',type:'action',icon:PaperPlaneTiltIcon},
 {id:'expiry',title:'Expires after 1 hour',detail:'The meeting point has a limited lifetime.',type:'boundary',icon:ClockIcon},
 {id:'invite',title:'Open meeting invite',detail:'The invitation opens straight onto the meeting point.',type:'action',icon:EnvelopeOpenIcon},
 {id:'landmark',title:'Read stage + landmark',detail:'A recognizable place, not just coordinates.',type:'action',icon:MapPinIcon},
 {id:'permission',title:'Use my location?',detail:'Location permission is optional. Both paths remain usable.',type:'decision',icon:CompassIcon},
 {id:'directions',title:'Show approximate direction',detail:'A direction to the meeting point, with the landmark still visible.',type:'action',icon:NavigationArrowIcon},
 {id:'find',title:'Find the landmark',detail:'Find the place yourself, even without location permission.',type:'action',icon:FlagIcon},
 {id:'privacy',title:'Invited friends only',detail:'Only the selected friends. Public visibility remains out of scope.',type:'note',icon:LockKeyIcon},
 {id:'signal',title:'Last update visible',detail:'Keep the received landmark; disclose stale data.',type:'note',icon:BroadcastIcon},
 {id:'revoke',title:'Owner can revoke access',detail:'No ongoing tracking after the point closes.',type:'note',icon:HandPalmIcon},
 {id:'closed',title:'Invitation has ended',detail:'Request a new invite; hide the old location.',type:'boundary',icon:XCircleIcon},
] as const;
export type NodeId = typeof nodes[number]['id'];
export type DiagramNode = typeof nodes[number];
export const edges: {from:NodeId;to:NodeId;label?:string;kind?:'policy'|'alternative'}[] = [
 {from:'problem',to:'audience'},{from:'audience',to:'solution'},
 {from:'solution',to:'expiry',kind:'policy'},{from:'solution',to:'invite',label:'friend opens invite'},
 {from:'invite',to:'landmark'},{from:'landmark',to:'permission'},
 {from:'permission',to:'directions',label:'yes'},{from:'permission',to:'find',label:'no',kind:'alternative'},
 {from:'directions',to:'find'},
 {from:'landmark',to:'signal',label:'poor signal',kind:'policy'},
 {from:'expiry',to:'revoke',label:'lifetime policy',kind:'policy'},
 {from:'expiry',to:'closed',label:'opened after closure',kind:'policy'},
];
export const mainPath = new Set<NodeId>(['problem','audience','solution','invite','landmark','permission','directions','find']);
export const directions = [
 {id:'neo',name:'Neobrutalism',subtitle:'Bold shapes. Clear choices. Nothing ambiguous.',sample:'Sampled from reference',strength:'Black outlines, hard offset shadows, and filled arrowheads make the structure explicit. Pink diamonds mark conditions; yellow actions stay rectangular; lime marks the start and end.',tradeoff:'Containers remain transparent native frames. Color supports the node’s role, while labels and geometry carry its meaning.',principle:'Black ink · sampled accents · true diamonds'},
 {id:'porcelain',name:'Porcelain',subtitle:'Rounded edges. A little weight. A quiet lift.',sample:'Soft ceramic',strength:'A fine raised rim and a soft contact shadow make every step feel like a small ceramic tile. Rounded corners keep the structure approachable.',tradeoff:'The most balanced starting point. Depth stays restrained enough for a dense diagram.',principle:'Raised rim · soft contact shadow · 20px corners'},
 {id:'glass',name:'Frosted glass',subtitle:'Light catches the edge. The thought stays clear.',sample:'Frosted surface',strength:'A translucent face, bright inner edge, and diffuse shadow make the items feel suspended just above the canvas. The dot grid softly dissolves beneath them.',tradeoff:'The lightest material. Fine edges need enough contrast to remain visible when zoomed out.',principle:'Frosted face · double edge · diffuse elevation'},
 {id:'paper',name:'Layered paper',subtitle:'A thought you could pick up and move.',sample:'Stacked sheets',strength:'Warm white paper, a fine inset rule, and a visible second sheet bring a familiar physical quality to each idea. Notes carry a gentle cream tint.',tradeoff:'The most tactile direction. Stacked edges add character, but need breathing room.',principle:'Layered sheets · warm white · lifted corners'},
 {id:'capsule',name:'Soft capsules',subtitle:'Generous curves. Almost no hard edges.',sample:'Softly molded',strength:'Pillowed surfaces and deep continuous curves make the diagram feel softer. Icons sit in small recessed wells, like controls molded into the surface.',tradeoff:'The friendliest silhouette. Large radii trade a little internal space for a much softer feel.',principle:'Pillowed face · recessed icons · 36px corners'},
 {id:'satin',name:'Satin',subtitle:'A little precision. A little polish.',sample:'Satin finish',strength:'A cool satin face, a narrow bevel, and a crisp lower lip give the items the feel of finely made hardware. A soft shadow keeps them floating above the white canvas.',tradeoff:'The strongest material expression. Keep the finish subtle so the hardware never competes with the idea.',principle:'Satin face · beveled edge · defined lower lip'},
] as const;
export type DirectionId = typeof directions[number]['id'];
