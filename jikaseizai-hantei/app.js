const $=id=>document.getElementById(id);
const MASTER_KEY="jikaseizai_master_v2",AUDIT_KEY="jikaseizai_audit_v2";
let master=[],selectedDrug=null,lastJudgment=null,masterReady=false;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function saveMaster(){try{localStorage.setItem(MASTER_KEY,JSON.stringify(master))}catch(e){$("masterStatus").textContent="マスターを端末に保存できません。容量を確認してください。"}}
function normalize(s){return String(s??"").normalize("NFKC").replace(/[\s　]/g,"").replace(/[（）()［］【】\[\]・,，]/g,"").toLowerCase()}
function extractStrength(s){
 const t=String(s??"").normalize("NFKC").replace(/μg|mcg/gi,"ug").replace(/％/g,"%").replace(/㎎/g,"mg").replace(/μＬ|μl/gi,"ul");
 const hits=[...t.matchAll(/(\d+(?:\.\d+)?)(mg|ug|g|%|mL|ml|単位|万単位|億単位)/gi)].map(m=>m[1]+m[2].toLowerCase());
 return hits.length?hits.join("+"):"";
}
function detectForm(d){
 const s=[d.genericName,d.officialName,d.name].filter(Boolean).join(" ").normalize("NFKC");
 if(/ドライシロップ/.test(s))return"ドライシロップ";
 if(/経口ゼリー|ゼリー剤/.test(s))return"経口ゼリー";
 if(/シロップ|内用液|経口液|液剤/.test(s))return"液剤";
 if(/チュアブル/.test(s))return"チュアブル";
 if(/カプセル/.test(s))return"カプセル";
 if(/細粒|顆粒/.test(s))return"顆粒・細粒";
 if(/散剤|散(?:\s|\d|\.)|末剤|粉末/.test(s))return"散剤";
 if(/口腔内崩壊|ＯＤ錠|OD錠/.test(s))return"口腔内崩壊錠";
 if(/錠剤|錠(?:\s|\d|\.)/.test(s))return"錠剤";
 if(/トローチ/.test(s))return"トローチ";
 return"判別不能";
}
function ingredientKey(d){
 const base=String(d.genericName||d.ingredient||d.officialName||d.name||"").normalize("NFKC").replace(/^【般】/,"");
 if(!base)return"";
 return normalize(base)
  .replace(/\d+(?:\.\d+)?(?:mg|ug|g|%|ml|単位|万単位|億単位)/gi,"")
  .replace(/(口腔内崩壊錠|ドライシロップ|シロップ|経口ゼリー|チュアブル|カプセル剤|カプセル|散剤|細粒剤|細粒|顆粒剤|顆粒|錠剤|錠|液剤|内用液|末剤|粉末)/g,"")
  .replace(/(標準的な記載|一般名処方|【般】)/g,"");
}
function currentOnDate(d,date){
 const end=String(d.discontinuedDate||d.validTo||"");
 const iso=(date||new Date().toISOString().slice(0,10)).replace(/-/g,"");
 return !end||end==="0"||end==="00000000"||end==="99999999"||end>=iso;
}
function renderResults(items){
 $("searchResults").innerHTML=items.length?items.slice(0,100).map((d,i)=>'<div class="result"><div><b>'+esc(d.name)+'</b><div class="small">'+esc([d.genericName||d.ingredient,d.strength||extractStrength(d.name),detectForm(d),d.company,d.code].filter(Boolean).join(" / "))+'</div></div><button data-pick="'+i+'">選択</button></div>').join(""):'<p class="muted">該当する医薬品がありません。</p>';
 [...$("searchResults").querySelectorAll("[data-pick]")].forEach(b=>b.onclick=()=>selectDrug(items[+b.dataset.pick]));
}
function selectDrug(d){
 selectedDrug=d;
 $("drugName").value=d.name||"";
 $("strength").value=d.strength||extractStrength(d.name)||"";
 $("selectedDrugStatus").textContent="選択中："+d.name+" ／ 一般名："+(d.genericName||d.ingredient||"マスター記載なし");
 runMarketCheck();
}
$("searchBtn").onclick=()=>{const q=normalize($("drugQuery").value);renderResults(q?master.filter(d=>normalize([d.name,d.officialName,d.genericName,d.ingredient,d.code,d.yjCode,d.company].join(" ")).includes(q)):master.slice(0,100))};
$("drugQuery").addEventListener("keydown",e=>{if(e.key==="Enter")$("searchBtn").click()});
function parseCSV(t){const rows=[];let row=[],cell="",quoted=false;for(let i=0;i<t.length;i++){const c=t[i],n=t[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++}else if(c==='"')quoted=!quoted;else if((c===","||c==="\t")&&!quoted){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&n==="\n")i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=""}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return rows}
$("masterFile").onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 const rows=parseCSV(new TextDecoder("shift_jis").decode(await f.arrayBuffer()));
 if(rows.length<2){alert("CSVの形式を確認してください");return}
 const head=rows[0].map(x=>x.trim()),find=(...ks)=>head.findIndex(h=>ks.some(k=>h.includes(k)));
 const ix={code:find("医薬品コード","レセ電コード"),name:find("漢字名称","品名","医薬品名","薬品名"),basic:find("基本漢字名称"),genericCode:find("一般名コード"),genericName:find("一般名処方の標準的な記載","一般名"),yj:find("薬価基準収載医薬品コード","YJコード"),form:find("剤形"),end:find("廃止年月日","廃止日")};
 if(ix.name<0){alert("品名列を特定できません。HPDX医薬品マスター全件CSVを使用してください");return}
 const data=rows.slice(1).map(r=>({code:r[ix.code]||"",name:r[ix.name]||"",officialName:ix.basic>=0?r[ix.basic]:"",genericCode:ix.genericCode>=0?r[ix.genericCode]:"",genericName:ix.genericName>=0?r[ix.genericName]:"",yjCode:ix.yj>=0?r[ix.yj]:"",formCode:ix.form>=0?r[ix.form]:"1",discontinuedDate:ix.end>=0?r[ix.end]:""})).filter(d=>d.name.trim());
 if(!confirm(data.length+"件を読み込みます。既存マスターを置き換えますか？"))return;
 master=data;masterReady=true;saveMaster();$("masterStatus").textContent="取り込み済み："+data.length.toLocaleString()+"件（剤形・規格照合を実行できます）";renderResults(master.slice(0,100));runMarketCheck();e.target.value="";
};
$("targetForm").onchange=runMarketCheck;
$("targetStrength").addEventListener("input",runMarketCheck);
$("rxDate").addEventListener("change",runMarketCheck);
function runMarketCheck(){
 const box=$("marketCheck");
 if(!selectedDrug){box.className="market-check pending";box.innerHTML="<b>市販剤形の自動照合：未実行</b><p>先に厚労省マスターから対象薬剤を選択してください。手入力だけでは自動判定しません。</p>";return null}
 const form=$("targetForm").value,strength=extractStrength($("targetStrength").value)||normalize($("targetStrength").value);
 if(!form||!strength){box.className="market-check pending";box.innerHTML="<b>市販剤形の自動照合：入力待ち</b><p>製剤後の剤形と規格（濃度・含量）を入力してください。</p>";return null}
 if(!masterReady||!master.length){box.className="market-check pending";box.innerHTML="<b>市販剤形の自動照合：マスター未読込</b><p>医薬品マスターを読み込めないため、算定可否は判定できません。</p>";return null}
 const key=ingredientKey(selectedDrug);
 if(!selectedDrug.genericName&&!selectedDrug.ingredient){box.className="market-check pending";box.innerHTML="<b>市販剤形の自動照合：照合不能</b><p>選択薬剤に一般名処方の標準的な記載がありません。商品名だけで成分同一性を推定すると誤判定につながるため、自動照合を停止しました。</p>";return null}
 if(!key){box.className="market-check pending";box.innerHTML="<b>市販剤形の自動照合：照合不能</b><p>選択薬剤の一般名情報が不足しています。一般名・成分の確認が必要です。</p>";return null}
 const date=$("rxDate").value;
 const related=master.filter(d=>d!==selectedDrug&&currentOnDate(d,date)&&ingredientKey(d)===key);
 const sameForm=related.filter(d=>detectForm(d)===form);
 const exact=sameForm.filter(d=>extractStrength(d.genericName||d.officialName||d.name)===strength);
 const unknown=sameForm.filter(d=>!extractStrength(d.genericName||d.officialName||d.name));
 const result={key,form,strength,related,sameForm,exact,unknown,confidence:exact.length?"一致製剤あり":unknown.length?"規格情報不足":"一致製剤なし"};
 const list=arr=>arr.slice(0,12).map(d=>'<li>'+esc(d.name)+' <span class="small">('+esc(extractStrength(d.genericName||d.officialName||d.name)||"規格不明")+', '+esc(d.code)+')</span></li>').join("");
 if(exact.length){box.className="market-check blocked";box.innerHTML="<b>市販製剤あり：同一成分・同一剤形・同一規格に一致</b><p>以下の収載品が見つかりました。原則として自家製剤加算は算定不可です。供給上の問題で必要数量を確保できない場合のみ、入手困難の根拠・薬剤名等を確認してください。</p><ul>"+list(exact)+"</ul>";}
 else if(unknown.length){box.className="market-check pending";box.innerHTML="<b>市販製剤の可能性あり：規格情報不足</b><p>同一成分・同一剤形の候補がありますが、マスター上の規格を確定できません。算定可とは判定せず、候補の規格を確認してください。</p><ul>"+list(unknown)+"</ul>";}
 else{box.className="market-check clear";const other=sameForm.length?("<p>同一成分・同一剤形で別規格の収載品：</p><ul>"+list(sameForm)+"</ul>"):"";box.innerHTML="<b>同一規格の市販製剤なし（マスター照合結果）</b><p>同一成分・同一剤形・同一規格の収載品は見つかりませんでした。これは算定可の確定ではありません。マスター収載範囲・一般名の同一性・製剤後規格を確認したうえで、他の算定要件を判定します。</p>"+other;}
 return result;
}
function checks(){return ["c1","c2","c4","c5","c6"].map(id=>$(id).checked)}
$("judgeBtn").onclick=()=>{
 const cs=checks(),drug=$("drugName").value.trim(),op=$("operation").value,un=$("uncertain").value.trim(),market=runMarketCheck();
 let status,reason;
 if(!drug||!op||!selectedDrug){status="要確認";reason="厚労省マスターから対象薬剤を選択し、製剤行為を入力してください。"}
 else if(op==="製剤行為なし"||!cs[0]){status="算定不可";reason="薬局での製剤行為を実施していない、または実施の確認ができていません。"}
 else if(!market){status="要確認";reason="市販剤形・規格の自動照合が完了していません。製剤後の剤形と規格を入力し、マスターを読み込んでください。"}
 else if(market.exact.length){status="算定不可（同一市販製剤あり）";reason="同一成分・同一剤形・同一規格の薬価収載品が見つかりました。供給上の理由で必要数量を確保できない場合は、別途その根拠を確認してください。"}
 else if(market.unknown.length){status="要確認";reason="同一成分・同一剤形の候補がありますが、規格情報が不足しているため自動判定を停止しました。"}
 else if(un){status="要確認";reason="補足欄に未確認事項が入力されています。"}
 else if(cs.every(Boolean)){status="算定要件確認済み（候補）";reason="マスター上で同一成分・同一剤形・同一規格の市販製剤は検出されず、入力された他の確認項目も満たしています。薬学的妥当性、医師の指示、供給状況、最新通知を最終確認してください。"}
 else{status="要確認";reason="製剤行為・必要性・算定対象区分・重複算定・記録の確認が不足しています。"}
 lastJudgment={status,reason,checks:cs,market:market?{form:market.form,strength:market.strength,exactCount:market.exact.length,unknownCount:market.unknown.length}:null,at:new Date().toISOString()};
 const box=$("judgment");box.hidden=false;box.className="judgment "+(status.startsWith("算定不可")?"ng":status.startsWith("算定要件")?"ok":"maybe");
 box.innerHTML="<strong>"+esc(status)+"</strong><p>"+esc(reason)+"</p><p class='small'>確認項目："+cs.filter(Boolean).length+"/5 ／ 市販剤形・規格照合："+esc(market?market.confidence:"未完了")+" ／ 粉砕可否は判定していません。</p>";
};
$("saveAudit").onclick=()=>{if(!lastJudgment){alert("先に算定可否を判定してください");return}const x={...lastJudgment,patient:$("patient").value,rxDate:$("rxDate").value,drug:$("drugName").value,strength:$("strength").value,targetForm:$("targetForm").value,targetStrength:$("targetStrength").value,quantity:$("quantity").value,details:$("details").value,operation:$("operation").value,uncertain:$("uncertain").value},a=JSON.parse(localStorage.getItem(AUDIT_KEY)||"[]");a.unshift(x);localStorage.setItem(AUDIT_KEY,JSON.stringify(a));renderAudit();alert("監査記録を保存しました")};
function renderAudit(){const a=JSON.parse(localStorage.getItem(AUDIT_KEY)||"[]");$("auditList").innerHTML=a.length?a.map(x=>'<div class="audititem"><b>'+esc(x.status)+'</b> '+esc(x.drug)+'<br><span class="small">'+esc(x.rxDate||x.at)+' / '+esc(x.operation)+' / '+esc(x.reason)+'</span></div>').join(""):'<p class="muted">保存された記録はありません。</p>'}
function download(n,c){const a=document.createElement("a"),u=URL.createObjectURL(new Blob(["\ufeff",c],{type:"text/csv;charset=utf-8"}));a.href=u;a.download=n;a.click();URL.revokeObjectURL(u)}
$("exportMaster").onclick=()=>{const cols=["code","name","officialName","genericCode","genericName","yjCode","formCode","discontinuedDate"],q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';download("内用薬マスター.csv",[cols.join(","),...master.map(d=>cols.map(k=>q(d[k])).join(","))].join("\r\n"))};
$("exportAudit").onclick=()=>{const a=JSON.parse(localStorage.getItem(AUDIT_KEY)||"[]");if(!a.length){alert("記録がありません");return}const cols=["at","patient","rxDate","drug","strength","targetForm","targetStrength","quantity","operation","details","status","reason","uncertain"],q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';download("自家製剤加算_監査記録.csv",[cols.join(","),...a.map(x=>cols.map(k=>q(x[k])).join(","))].join("\r\n"))};
$("clearAudit").onclick=()=>{if(confirm("監査記録をすべて削除しますか？")){localStorage.removeItem(AUDIT_KEY);renderAudit()}};
$("clearBtn").onclick=()=>{if(confirm("入力内容をクリアしますか？")){document.querySelectorAll("main input:not([type=file]),main textarea").forEach(x=>x.value="");document.querySelectorAll("main input[type=checkbox]").forEach(x=>x.checked=false);$("operation").value="";$("targetForm").value="";$("judgment").hidden=true;$("marketCheck").innerHTML="";selectedDrug=null;lastJudgment=null;$("selectedDrugStatus").textContent="薬剤未選択"}};
async function loadBundledMaster(){
 try{const res=await fetch("./drug_master.json?build=20261121");if(!res.ok)throw new Error("master fetch failed");const data=await res.json();if(!Array.isArray(data)||!data.length)throw new Error("empty bundled master");master=data;masterReady=true;saveMaster();$("masterStatus").textContent="厚労省医薬品マスター：内用薬 "+master.length.toLocaleString()+"件（同一成分・剤形・規格の照合対象）";renderResults(master.slice(0,100));}
 catch(e){const cached=JSON.parse(localStorage.getItem(MASTER_KEY)||"[]");if(cached.length){master=cached;masterReady=true;$("masterStatus").textContent="端末保存マスター："+master.length.toLocaleString()+"件（最新性は要確認）";renderResults(master.slice(0,100));}else{$("masterStatus").textContent="マスター未読込：自動照合・算定候補判定は利用できません。CSVを取り込んでください。";}}
}
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
renderAudit();loadBundledMaster();