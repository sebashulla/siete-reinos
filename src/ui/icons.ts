const paths:Record<string,string>={
 crown:'<path d="M3 18V7l5 5 4-8 4 8 5-5v11H3Z"/><path d="M3 21h18"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
 sword:'<path d="m5 20 3-3m-4-3 6 6M8 16l11-11 2-2v5L10 19M14 4l6 6"/>',
 character:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3M9 16l3 3 3-3"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 book:'<path d="M12 5C8 2 4 3 3 4v16c3-2 6-1 9 1 3-2 6-3 9-1V4c-4-2-7-1-9 1v16"/>',
 online:'<circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2M3 8a3 3 0 0 0 0 6M21 8a3 3 0 0 1 0 6"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 gem:'<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18"/>',
 shield:'<path d="M12 3 3 6v6c0 5 5 8 9 10 4-2 9-5 9-10V6l-9-3Z"/><path d="m8 12 3 3 5-6"/>',
 exit:'<path d="M9 3H4v18h5m5-15 6 6-6 6M8 12h12"/>',
 magic:'<path d="m4 20 9-9m-2-7 1 3m7-4-2 3m4 5-3 1M6 8l2 2m7-3 2 2-2 2-2-2 2-2Z"/>',
 map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
 pickaxe:'<path d="m5 21 10-13M3 6c7-4 13-1 18 6M9 3 5 7m11 0 4 5"/>',
 chevron:'<path d="m8 4 8 8-8 8"/>',
 heart:'<path d="M12 21 3 12C-1 5 7 1 12 7c5-6 13-2 9 5l-9 9Z"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
};
export function icon(name:string,size=22):string{return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.gem}</svg>`;}
export function escapeHtml(text:string):string{return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
