import {resolveTxt} from 'node:dns/promises';
const from=process.env.EMAIL_FROM??'',selector=process.env.EMAIL_DKIM_SELECTOR??'';
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)||! /^[a-zA-Z0-9_-]+$/.test(selector)){console.error('Set EMAIL_FROM and EMAIL_DKIM_SELECTOR in the protected environment');process.exitCode=1;}else{
const domain=from.split('@')[1];const txt=async(name)=>{try{return (await resolveTxt(name)).map(r=>r.join(''));}catch{return [];}};
const [spf,dkim,dmarc]=await Promise.all([txt(domain),txt(selector+'._domainkey.'+domain),txt('_dmarc.'+domain)]);
const checks={spf:spf.some(v=>v.startsWith('v=spf1')),dkim:dkim.some(v=>/p=.+/.test(v)),dmarc:dmarc.some(v=>v.startsWith('v=DMARC1'))};console.log(JSON.stringify(checks));if(!Object.values(checks).every(Boolean))process.exitCode=1;
}
