// ============================================================
// CONSELHO MUNICIPAL DE SAÚDE — SISTEMA DE RECOMPOSIÇÃO v2.2
// Code.gs — Google Apps Script Backend
// ============================================================

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// ────────────────────────────────────────────────────────────
// ROTEAMENTO PRINCIPAL
// ────────────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    switch (action) {
      case "getDashboard":             result = getDashboard();                   break;
      case "getEntidades":             result = getEntidades();                   break;
      case "getConselheiros":          result = getConselheiros();                break;
      case "getInscricoes":            result = getInscricoes();                  break;
      case "getInconsistencias":       result = getInconsistencias();             break;
      case "getConfig":                result = getConfig();                      break;
      case "validarSenha":             result = validarSenha(e.parameter.senha); break;
      case "getRenovacoes":            result = getRenovacoes();                  break;
      case "getAvaliacoes":            result = getAvaliacoes();                  break;
      case "getRegrasInconsistencias": result = getRegrasInconsistencias();       break;
      case "getStatusManuais":         result = getStatusManuais();               break;
      case "healthCheck":              result = healthCheck();                    break;
      default:                         result = { erro: "Ação inválida: " + action };
    }
  } catch (err) {
    result = { erro: err.message, stack: err.stack };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case "saveAvaliacao":           result = saveAvaliacao(data);             break;
      case "saveConfig":              result = saveConfig(data);                break;
      case "saveAnotacao":            result = saveAnotacao(data);              break;
      case "saveRegraInconsistencia": result = saveRegraInconsistencia(data);   break;
      case "saveStatusManual":        result = saveStatusManual(data);          break;
      default:                        result = { erro: "Ação inválida" };
    }
  } catch (err) {
    result = { erro: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────────────────
// SETUP 2.1 — abas e colunas novas em todosconselheiros
// Nunca apaga nem reordena colunas existentes.
// ────────────────────────────────────────────────────────────

function setupConfig2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const criadas = [], jaExistiam = [], log = [];

  // config
  let cfgSheet = ss.getSheetByName("config");
  if (!cfgSheet) {
    cfgSheet = ss.insertSheet("config");
    cfgSheet.appendRow(["chave","valor","descricao"]);
    [["senha_admin","cms2024","Senha do painel admin"],
     ["total_cadeiras","32","Total de vagas no conselho"],
     ["municipio","Montes Claros","Nome do município"],
     ["uf","MG","UF"],
     ["ano_mandato","2024-2026","Período do mandato"],
     ["cadeiras_usuarios","16","Cadeiras segmento Usuário"],
     ["cadeiras_trabalhadores","8","Cadeiras segmento Trabalhador"],
     ["cadeiras_gestores","8","Cadeiras segmento Gestor/Prestador"],
     ["ultima_atualizacao",new Date().toISOString(),"Última atualização"]
    ].forEach(r=>cfgSheet.appendRow(r));
    criadas.push("config");
  } else jaExistiam.push("config");

  // avaliacoes
  let avalSheet = ss.getSheetByName("avaliacoes");
  if (!avalSheet) {
    avalSheet = ss.insertSheet("avaliacoes");
    avalSheet.appendRow(["entidade","timestamp","autor","nota","anotacao"]);
    criadas.push("avaliacoes");
  } else jaExistiam.push("avaliacoes");

  // regras_inconsistencias
  let regrasSheet = ss.getSheetByName("regras_inconsistencias");
  if (!regrasSheet) {
    regrasSheet = ss.insertSheet("regras_inconsistencias");
    regrasSheet.appendRow(["id","nome","descricao","ativa","severidade","param1_nome","param1_valor","param2_nome","param2_valor"]);
    [["CPF_DUPLICADO","CPF Duplicado","Detecta CPF igual em mais de uma renovação","SIM","CRITICO","","","",""],
     ["MANDATO_INVALIDO","Mandato Inválido","Conselheiro com 2º mandato tentando renovar","SIM","CRITICO","mandatos_max","2","",""],
     ["DADOS_FALTANTES","Dados Faltantes","Renovação sem titular, suplente, ofício ou declaração","SIM","ALERTA","","","",""],
     ["CNPJ_INVALIDO","CNPJ Inválido","CNPJ com formato inválido (deve ter 14 dígitos)","SIM","ALERTA","","","",""],
     ["DOCS_FALTANTES","Docs Faltantes (Inscrição)","Inscrição com documentos obrigatórios ausentes","SIM","ALERTA","","","",""],
     ["SEM_RESPOSTA","Sem Resposta","Entidade da lista mestre sem renovação nem inscrição","SIM","INFO","","","",""],
     ["CLS_MULTIPLAS_CADEIRAS","CLS com múltiplas cadeiras","CLS Ind ocupa no máx. 3 cadeiras por exceção","SIM","ALERTA","cls_ind_max","3","cls_ind_nome","CLS Ind"],
     ["PRESTADOR_SEM_PAR","Prestador sem par","Cadeira T/S de prestador sem o par correspondente","SIM","ALERTA","","","",""],
     ["TITULAR_EXERCE_DIRECAO","Titular exerce direção","Titular que também exerce direção na entidade","SIM","ALERTA","","","",""],
    ].forEach(r=>regrasSheet.appendRow(r));
    criadas.push("regras_inconsistencias");
  } else jaExistiam.push("regras_inconsistencias");

  // status_manual
  let smSheet = ss.getSheetByName("status_manual");
  if (!smSheet) {
    smSheet = ss.insertSheet("status_manual");
    smSheet.appendRow(["entidade","status_manual","observacao","autor","timestamp"]);
    criadas.push("status_manual");
  } else jaExistiam.push("status_manual");

  // cadeiras
  let cadeiraSheet = ss.getSheetByName("cadeiras");
  if (!cadeiraSheet) {
    cadeiraSheet = ss.insertSheet("cadeiras");
    cadeiraSheet.appendRow(["ID_CADEIRA","SEGMENTO","SUBTIPO","TIPO_PAR","ENTIDADE_TITULAR","ENTIDADE_SUPLENTE","OBSERVACAO"]);
    [["ID-P1-T","GESTOR/PRESTADOR","PRESTADOR","T/S","Fundação de Saúde Dilson de Quadros Godinho (HDG)","Associação de Pais e Amigos dos Excepcionais (APAE)","Par PRESTADOR 1 — Titular"],
     ["ID-P1-S","GESTOR/PRESTADOR","PRESTADOR","T/S","Fundação de Saúde Dilson de Quadros Godinho (HDG)","Associação de Pais e Amigos dos Excepcionais (APAE)","Par PRESTADOR 1 — Suplente"],
     ["ID-P2-T","GESTOR/PRESTADOR","PRESTADOR","T/S","Grupo de Apoio à Prevenção e aos Portadores da AIDS (GRAPPA)","Associação Sociedade Educacional Mendonça e Silva (Capelo Gaivota)","Par PRESTADOR 2 — Titular"],
     ["ID-P2-S","GESTOR/PRESTADOR","PRESTADOR","T/S","Grupo de Apoio à Prevenção e aos Portadores da AIDS (GRAPPA)","Associação Sociedade Educacional Mendonça e Silva (Capelo Gaivota)","Par PRESTADOR 2 — Suplente"],
     ["ID-P3-T","GESTOR/PRESTADOR","PRESTADOR","T/S","Irmandade Nossa Senhora das Mercês de Montes Claros – Santa Casa (HSC)","Fundação Clarice Albuquerque (Vovó Clarice)","Par PRESTADOR 3 — Titular"],
     ["ID-P3-S","GESTOR/PRESTADOR","PRESTADOR","T/S","Irmandade Nossa Senhora das Mercês de Montes Claros – Santa Casa (HSC)","Fundação Clarice Albuquerque (Vovó Clarice)","Par PRESTADOR 3 — Suplente"],
     ["ID-U1-T","USUARIO","USUARIO","T/S","Conselho Local de Saúde Independência (CLS Ind)","Conselho Local de Saúde Independência (CLS Ind)","Par CLS 1 — Titular (Amanda)"],
     ["ID-U1-S","USUARIO","USUARIO","T/S","Conselho Local de Saúde Independência (CLS Ind)","Conselho Local de Saúde Independência (CLS Ind)","Par CLS 1 — Suplente (Terezinha)"],
     ["ID-U2-T","USUARIO","USUARIO","T/S","Conselho Local de Saúde Grande Renascença (CLS Ren)","Conselho Local de Saúde Independência (CLS Ind)","Par CLS 2 — Titular (Emanuela)"],
     ["ID-U2-S","USUARIO","USUARIO","T/S","Conselho Local de Saúde Grande Renascença (CLS Ren)","Conselho Local de Saúde Independência (CLS Ind)","Par CLS 2 — Suplente (Wilhas) — CLS Ind por exceção"],
     ["ID-U3-T","USUARIO","USUARIO","T/S","Conselho Local de Saúde Jardim Primavera II (CLS JD PR. II)","Conselho Local de Saúde Bela Vista/ Vila Atlântida (CLS Bl.V/V. Atl)","Par CLS 3 — Titular (Joel)"],
     ["ID-U3-S","USUARIO","USUARIO","T/S","Conselho Local de Saúde Jardim Primavera II (CLS JD PR. II)","Conselho Local de Saúde Bela Vista/ Vila Atlântida (CLS Bl.V/V. Atl)","Par CLS 3 — Suplente (Danielle)"],
    ].forEach(r=>cadeiraSheet.appendRow(r));
    criadas.push("cadeiras");
  } else jaExistiam.push("cadeiras");

  // Adicionar colunas novas em todosconselheiros (nunca altera as existentes)
  const colsAdicionadas = [];
  const consSheet = ss.getSheetByName("todosconselheiros");
  if (consSheet && consSheet.getLastColumn()>0) {
    let hdr = consSheet.getRange(1,1,1,consSheet.getLastColumn()).getValues()[0].map(h=>String(h).trim());
    if (!hdr.includes("ID_CADEIRA")) {
      const c=consSheet.getLastColumn()+1;
      consSheet.getRange(1,c).setValue("ID_CADEIRA");
      colsAdicionadas.push("ID_CADEIRA (col "+c+")");
      hdr = consSheet.getRange(1,1,1,consSheet.getLastColumn()).getValues()[0].map(h=>String(h).trim());
    }
    if (!hdr.includes("SUBTIPO")) {
      const c=consSheet.getLastColumn()+1;
      consSheet.getRange(1,c).setValue("SUBTIPO");
      colsAdicionadas.push("SUBTIPO (col "+c+")");
    }
  } else { log.push("ATENÇÃO: aba todosconselheiros não encontrada."); }

  return { ok:true, mensagem:"setupConfig2 v2.2 concluído", criadas, jaExistiam, colunasAdicionadas:colsAdicionadas, log };
}

function setupConfig() { return setupConfig2(); }

// ────────────────────────────────────────────────────────────
// SETUP 3 — enriquece a aba "entidades" com colunas extras:
//   DIRETOR, TELEFONE_ENTIDADE, EMAIL_ENTIDADE,
//   SEGMENTO, ID_CADEIRAS (lista separada por vírgula)
//
// Estas colunas são preenchidas manualmente na planilha e
// lidas pelo sistema para exibir no card de cada entidade.
// NÃO apaga dados existentes: só adiciona colunas ausentes.
// ────────────────────────────────────────────────────────────

function setupSheet3() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [], adicionadas = [];

  const entSheet = ss.getSheetByName("entidades");
  if (!entSheet) {
    log.push("ERRO: aba 'entidades' não encontrada. Crie-a com a lista de entidades primeiro.");
    return { ok:false, log };
  }

  // Colunas que queremos garantir na aba entidades
  const colsDesejadas = [
    { nome:"Nome da entidade",  desc:"Nome completo (já existe)" },
    { nome:"SEGMENTO",          desc:"USUARIO / TRABALHADOR / GESTOR / PRESTADOR" },
    { nome:"SUBTIPO",           desc:"GESTOR ou PRESTADOR (só p/ GESTOR/PRESTADOR)" },
    { nome:"ID_CADEIRAS",       desc:"IDs separados por vírgula ex: G1-T,G1-S" },
    { nome:"DIRETOR",           desc:"Nome do diretor / responsável pela entidade" },
    { nome:"TELEFONE_ENT",      desc:"Telefone de contato da entidade" },
    { nome:"EMAIL_ENT",         desc:"E-mail de contato da entidade" },
    { nome:"CNPJ",              desc:"CNPJ da entidade (14 dígitos)" },
    { nome:"OBSERVACAO",        desc:"Observação livre — aparece como tooltip no card" },
  ];

  const lastCol = entSheet.getLastColumn();
  let headers = lastCol > 0
    ? entSheet.getRange(1,1,1,lastCol).getValues()[0].map(h=>String(h).trim())
    : [];

  colsDesejadas.forEach(col => {
    if (!headers.includes(col.nome)) {
      const c = entSheet.getLastColumn() + 1;
      entSheet.getRange(1,c).setValue(col.nome);
      // Adiciona comentário para orientar o preenchimento
      entSheet.getRange(1,c).setNote(col.desc);
      adicionadas.push(col.nome+" (col "+c+") — "+col.desc);
      headers = entSheet.getRange(1,1,1,entSheet.getLastColumn()).getValues()[0].map(h=>String(h).trim());
    } else {
      log.push("Coluna '"+col.nome+"' já existe.");
    }
  });

  // Pré-preencher SEGMENTO, SUBTIPO e ID_CADEIRAS para as entidades que já
  // estão em todosconselheiros, usando os dados que já temos
  const consRows = getSheetData("todosconselheiros");
  const entRows  = entSheet.getDataRange().getValues();
  const entHeaders = entRows[0].map(h=>String(h).trim());
  const iNome    = entHeaders.indexOf("Nome da entidade");
  const iSeg     = entHeaders.indexOf("SEGMENTO");
  const iSub     = entHeaders.indexOf("SUBTIPO");
  const iIDs     = entHeaders.indexOf("ID_CADEIRAS");

  if (iNome>=0) {
    for (let row=1; row<entRows.length; row++) {
      const nomeEnt = String(entRows[row][iNome]||"").trim();
      if (!nomeEnt) continue;
      const matching = consRows.filter(c=>normalizar(c["ENTIDADE"])===normalizar(nomeEnt));
      if (!matching.length) continue;

      // Segmento — pega do primeiro match
      if (iSeg>=0 && !String(entRows[row][iSeg]||"").trim()) {
        const seg = String(matching[0]["SEGMENTO"]||"").trim();
        if (seg) entSheet.getRange(row+1, iSeg+1).setValue(seg);
      }
      // Subtipo — pega do primeiro match que tiver
      if (iSub>=0 && !String(entRows[row][iSub]||"").trim()) {
        const sub = matching.find(c=>String(c["SUBTIPO"]||"").trim());
        if (sub) entSheet.getRange(row+1, iSub+1).setValue(String(sub["SUBTIPO"]||"").trim());
      }
      // ID_CADEIRAS — lista todos os IDs vinculados a essa entidade
      if (iIDs>=0 && !String(entRows[row][iIDs]||"").trim()) {
        const ids = matching
          .map(c=>String(c["ID_CADEIRA"]||"").trim())
          .filter(id=>id!=="");
        if (ids.length) entSheet.getRange(row+1, iIDs+1).setValue(ids.join(","));
      }
    }
    log.push("Pré-preenchimento de SEGMENTO, SUBTIPO e ID_CADEIRAS concluído onde possível.");
  }

  return {
    ok:true,
    mensagem:"setupSheet3 v2.2 concluído",
    adicionadas,
    log,
    proximosPassos:[
      "1. Preencha DIRETOR, TELEFONE_ENT, EMAIL_ENT e CNPJ para cada entidade",
      "2. Verifique se SEGMENTO e ID_CADEIRAS foram pré-preenchidos corretamente",
      "3. A coluna OBSERVACAO vira tooltip no card — use para notas permanentes da entidade",
      "4. A coluna ID_CADEIRAS aceita múltiplos IDs separados por vírgula ex: G4-T,G4-S",
      "5. Publique nova versão do Web App após executar este setup"
    ]
  };
}

// ────────────────────────────────────────────────────────────
// HEALTH CHECK
// ────────────────────────────────────────────────────────────

function healthCheck() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const checks = [];
  const abasObrig = [
    {nome:"config",desc:"Configurações"},
    {nome:"todosconselheiros",desc:"Conselheiros atuais"},
    {nome:"entidades",desc:"Lista mestre de entidades"},
    {nome:"renovacoes",desc:"Respostas do formulário"},
    {nome:"inscritos",desc:"Novas inscrições"},
    {nome:"avaliacoes",desc:"Anotações da comissão"},
    {nome:"regras_inconsistencias",desc:"Regras controláveis (v2)"},
    {nome:"status_manual",desc:"Status manuais (v2)"},
    {nome:"cadeiras",desc:"IDs de cadeiras (v2)"},
  ];
  abasObrig.forEach(aba=>{
    const sheet=ss.getSheetByName(aba.nome);
    const ok=!!sheet;
    checks.push({tipo:ok?"ABA_OK":"ABA_AUSENTE",ok,item:aba.nome,
      descricao:ok?`"${aba.nome}" encontrada`:`"${aba.nome}" ausente — execute setupConfig2()`,
      detalhe:ok?(Math.max(0,sheet.getLastRow()-1)+" linha(s)"):aba.desc});
  });

  // Colunas v1 obrigatórias em todosconselheiros
  const csht=ss.getSheetByName("todosconselheiros");
  if(csht&&csht.getLastColumn()>0){
    const hdr=csht.getRange(1,1,1,csht.getLastColumn()).getValues()[0].map(h=>String(h).trim());
    ["SEGMENTO","ENTIDADE","CADEIRA","NOME","MANDATO"].forEach(col=>{
      const ok=hdr.includes(col);
      checks.push({tipo:ok?"COLUNA_OK":"COLUNA_AUSENTE",ok,item:"todosconselheiros."+col,
        descricao:ok?`"${col}" OK`:`Coluna obrigatória "${col}" ausente`,detalhe:""});
    });
    ["ID_CADEIRA","SUBTIPO"].forEach(col=>{
      const ok=hdr.includes(col);
      checks.push({tipo:ok?"COLUNA_V2_OK":"COLUNA_V2_AUSENTE",ok,item:"todosconselheiros."+col,
        descricao:ok?`Coluna v2 "${col}" presente`:`Coluna v2 "${col}" ausente — execute setupConfig2()`,
        detalhe:"Funcionalidade v2"});
    });
  }

  // Colunas v3 em entidades
  const esht=ss.getSheetByName("entidades");
  if(esht&&esht.getLastColumn()>0){
    const hdr=esht.getRange(1,1,1,esht.getLastColumn()).getValues()[0].map(h=>String(h).trim());
    ["DIRETOR","TELEFONE_ENT","EMAIL_ENT","ID_CADEIRAS"].forEach(col=>{
      const ok=hdr.includes(col);
      checks.push({tipo:ok?"COLUNA_V3_OK":"COLUNA_V3_AUSENTE",ok,item:"entidades."+col,
        descricao:ok?`Coluna v3 "${col}" presente`:`Coluna v3 "${col}" ausente — execute setupSheet3()`,
        detalhe:"Funcionalidade v3 (card enriquecido)"});
    });
  }

  const cfg=getConfigMap();
  ["senha_admin","total_cadeiras","municipio","ano_mandato"].forEach(k=>{
    const val=cfg[k];
    checks.push({tipo:val?"CONFIG_OK":"CONFIG_AUSENTE",ok:!!val,item:"config."+k,
      descricao:val?`Config "${k}" = "${val}"`:(`Config "${k}" não definida`),detalhe:""});
  });

  let contagens={};
  try{
    const cons=getConselheiros(),ent=getEntidades(),inc=getInscricoes();
    contagens={conselheiros:cons.total,aptos:cons.aptos,impedidos:cons.impedidos,
      entidades:ent.resumo.total,completo:ent.resumo.completo,semResposta:ent.resumo.semResposta,
      inscricoes:inc.resumo.total};
    checks.push({tipo:"CONTAGENS_OK",ok:true,item:"contagens",
      descricao:"Contagens OK",
      detalhe:`${cons.total} conselheiros · ${ent.resumo.total} entidades · ${inc.resumo.total} inscrições`});
  }catch(err){
    checks.push({tipo:"CONTAGENS_ERRO",ok:false,item:"contagens",
      descricao:"Erro: "+err.message,detalhe:err.stack});
  }

  const erros  =checks.filter(c=>!c.ok&&!c.tipo.includes("V2")&&!c.tipo.includes("V3")).length;
  const avisos =checks.filter(c=>!c.ok&&(c.tipo.includes("V2")||c.tipo.includes("V3"))).length;
  return{ok:erros===0,resumo:{total:checks.length,ok:checks.filter(c=>c.ok).length,erros,avisos},
    contagens,checks,timestamp:new Date().toISOString()};
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

function getSheetData(nomeAba){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet=ss.getSheetByName(nomeAba);
  if(!sheet)return[];
  const data=sheet.getDataRange().getValues();
  if(data.length<2)return[];
  const headers=data[0].map(h=>String(h).trim());
  return data.slice(1).map(row=>{
    const obj={};headers.forEach((h,i)=>{obj[h]=row[i]!==undefined?row[i]:""});return obj;
  });
}

function getConfigMap(){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet=ss.getSheetByName("config");
  if(!sheet)return{};
  const map={};
  sheet.getDataRange().getValues().slice(1).forEach(row=>{
    if(row[0])map[String(row[0]).trim()]=String(row[1]||"").trim();
  });
  return map;
}

function normalizar(str){
  return String(str||"").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");
}

function mascararDado(dado){
  if(!dado)return"";
  const s=String(dado).replace(/\D/g,"");
  if(!s.length)return"***";
  return s.substring(0,3)+".***."+"***-"+s.substring(s.length-2);
}

function mascararEndereco(end){
  if(!end)return"";
  return String(end).split(",")[0]+", ***";
}

function validarCNPJ(cnpj){
  return!!cnpj&&String(cnpj).replace(/\D/g,"").length===14;
}

function getConfig(){
  const cfg=getConfigMap();const safe=Object.assign({},cfg);delete safe.senha_admin;
  return{ok:true,config:safe};
}

function validarSenha(senha){
  const cfg=getConfigMap();const ok=senha===(cfg.senha_admin||"cms2024");
  return{ok,valido:ok};
}

// ────────────────────────────────────────────────────────────
// REGRAS DE INCONSISTÊNCIAS
// ────────────────────────────────────────────────────────────

function getRegrasInconsistencias(){
  const rows=getSheetData("regras_inconsistencias");
  return{ok:true,total:rows.length,regras:rows.map(r=>({
    id:String(r["id"]||"").trim(),nome:String(r["nome"]||"").trim(),
    descricao:String(r["descricao"]||"").trim(),
    ativa:String(r["ativa"]||"NÃO").trim().toUpperCase()==="SIM",
    severidade:String(r["severidade"]||"ALERTA").trim(),
    param1Nome:String(r["param1_nome"]||"").trim(),param1Valor:String(r["param1_valor"]||"").trim(),
    param2Nome:String(r["param2_nome"]||"").trim(),param2Valor:String(r["param2_valor"]||"").trim(),
  }))};
}

function saveRegraInconsistencia(data){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet=ss.getSheetByName("regras_inconsistencias");
  if(!sheet)return{ok:false,erro:"Aba regras_inconsistencias não encontrada"};
  const rows=sheet.getDataRange().getValues();
  for(let i=1;i<rows.length;i++){
    if(String(rows[i][0]).trim()===data.id){
      if(data.ativa!==undefined)       sheet.getRange(i+1,4).setValue(data.ativa?"SIM":"NÃO");
      if(data.severidade!==undefined)  sheet.getRange(i+1,5).setValue(data.severidade);
      if(data.param1Valor!==undefined) sheet.getRange(i+1,7).setValue(data.param1Valor);
      if(data.param2Valor!==undefined) sheet.getRange(i+1,9).setValue(data.param2Valor);
      return{ok:true};
    }
  }
  return{ok:false,erro:"Regra não encontrada: "+data.id};
}

// ────────────────────────────────────────────────────────────
// STATUS MANUAL
// ────────────────────────────────────────────────────────────

function getStatusManuais(){
  const rows=getSheetData("status_manual");
  const mapa={};
  rows.forEach(r=>{
    const ent=String(r["entidade"]||"").trim();
    if(!ent)return;
    mapa[normalizar(ent)]={entidade:ent,
      statusManual:String(r["status_manual"]||"").trim(),
      observacao:  String(r["observacao"]   ||"").trim(),
      autor:       String(r["autor"]        ||"").trim(),
      timestamp:   String(r["timestamp"]    ||"").trim()};
  });
  return{ok:true,total:Object.keys(mapa).length,statusManuais:mapa};
}

function saveStatusManual(data){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet=ss.getSheetByName("status_manual");
  if(!sheet)return{ok:false,erro:"Aba status_manual não encontrada."};
  const ts=new Date().toISOString();
  const rows=sheet.getDataRange().getValues();
  for(let i=1;i<rows.length;i++){
    if(normalizar(String(rows[i][0]))===normalizar(data.entidade)){
      if(!data.statusManual){sheet.deleteRow(i+1);return{ok:true,acao:"removido",timestamp:ts};}
      sheet.getRange(i+1,2).setValue(data.statusManual||"");
      sheet.getRange(i+1,3).setValue(data.observacao||"");
      sheet.getRange(i+1,4).setValue(data.autor||"admin");
      sheet.getRange(i+1,5).setValue(ts);
      return{ok:true,acao:"atualizado",timestamp:ts};
    }
  }
  if(!data.statusManual)return{ok:true,acao:"nada_a_remover"};
  sheet.appendRow([data.entidade,data.statusManual||"",data.observacao||"",data.autor||"admin",ts]);
  return{ok:true,acao:"inserido",timestamp:ts};
}

// ────────────────────────────────────────────────────────────
// FUNÇÃO: getConselheiros
// ────────────────────────────────────────────────────────────

function getConselheiros(){
  const rows=getSheetData("todosconselheiros");
  const smMapa=getStatusManuais().statusManuais||{};
  const conselheiros=rows
    .filter(r=>r["NOME"]&&String(r["NOME"]).trim()!=="")
    .map(r=>{
      const mandato =parseInt(r["MANDATO"])||1;
      const impedido=mandato>=2;
      const segmento=String(r["SEGMENTO"]||"").trim();
      const entidade=String(r["ENTIDADE"]||"").trim();
      let subtipo=String(r["SUBTIPO"]||"").trim().toUpperCase();
      if(!subtipo&&(segmento.toLowerCase().includes("gestor")||segmento.toLowerCase().includes("prestador")))
        subtipo="GESTOR";
      const sm=smMapa[normalizar(entidade)];
      return{segmento,subtipo:subtipo||"",entidade,
        cadeira:  String(r["CADEIRA"]   ||"").trim(),
        idCadeira:String(r["ID_CADEIRA"]||"").trim(),
        nome:     String(r["NOME"]      ||"").trim(),
        email:    String(r["EMAIL"]     ||"").trim(),
        telefone: String(r["TELEFONE"]  ||"").trim(),
        rg:       mascararDado(r["RG"]),
        cpf:      mascararDado(r["CPF"]),
        endereco: mascararEndereco(r["ENDERECO"]),
        mandato,impedido,status:impedido?"IMPEDIDO":"APTO",
        statusManual:sm?sm.statusManual:null,
        observacao:  sm?sm.observacao:null};
    });
  const segmentos={},subtipos={};
  conselheiros.forEach(c=>{
    segmentos[c.segmento]=(segmentos[c.segmento]||0)+1;
    if(c.subtipo)subtipos[c.subtipo]=(subtipos[c.subtipo]||0)+1;
  });
  return{ok:true,total:conselheiros.length,
    impedidos:conselheiros.filter(c=>c.impedido).length,
    aptos:    conselheiros.filter(c=>!c.impedido).length,
    segmentos,subtipos,conselheiros};
}

// ────────────────────────────────────────────────────────────
// FUNÇÃO: getRenovacoes
// ────────────────────────────────────────────────────────────

function getRenovacoes(){
  const rows=getSheetData("renovacoes");
  const conselheiros=getSheetData("todosconselheiros");
  const renovacoes=rows.map(r=>{
    const nomeEntidade=String(r["Nome completo da entidade"]||r["Nome fantasia"]||"").trim();
    const titularNome =String(r["Titular Nome"] ||"").trim();
    const suplNome    =String(r["Suplente Nome"]||"").trim();
    const oficioLink  =String(r["Ofício"]       ||"").trim();
    const confOficio  =String(r["Confirmação Ofício"]||"").trim().toUpperCase();
    const declaracao  =String(r["Declaração"]   ||"").trim();
    const consAtual   =conselheiros.find(c=>normalizar(c["ENTIDADE"])===normalizar(nomeEntidade));
    const mandatoAtual=consAtual?(parseInt(consAtual["MANDATO"])||1):1;
    const impedido    =mandatoAtual>=2;
    const oficioOk    =confOficio==="SIM"||confOficio==="S"||oficioLink!=="";
    let substituicao="nenhuma";
    if(consAtual){
      const nomAtual=String(consAtual["NOME"]||"").trim();
      const titMudou=titularNome!==""&&normalizar(titularNome)!==normalizar(nomAtual);
      const supMudou=suplNome   !==""&&normalizar(suplNome)   !==normalizar(nomAtual);
      if(titMudou&&supMudou)substituicao="total";
      else if(titMudou||supMudou)substituicao="parcial";
    }
    const nomeDeclarante =String(r["Nome Declarante"] ||"").trim();
    const cargoDeclarante=String(r["Cargo Declarante"]||"").trim();
    const docCompleto=oficioOk&&declaracao!==""&&nomeDeclarante!=="";
    let statusRenovacao;
    if(impedido)statusRenovacao="IMPEDIDO";
    else if(docCompleto&&titularNome!==""&&suplNome!=="")statusRenovacao="COMPLETO";
    else if(titularNome!==""||suplNome!==""||oficioOk)  statusRenovacao="PENDENTE";
    else statusRenovacao="NAO_RESPONDEU";
    return{
      carimbo:r["Carimbo de data/hora"]||"",entidade:nomeEntidade,
      nomeFantasia:String(r["Nome fantasia"]||"").trim(),
      sigla:   String(r["Sigla"]    ||"").trim(),
      cnpj:    String(r["CNPJ"]     ||"").trim(),
      telefone:String(r["Telefone"] ||"").trim(),
      email:   String(r["Email"]    ||"").trim(),
      area:    String(r["Área atuação"]||"").trim(),
      diretor: String(r["Diretor"]  ||"").trim(),
      titular:{nome:titularNome,
        telefone:     String(r["Titular Telefone"]      ||"").trim(),
        email:        String(r["Titular Email"]         ||"").trim(),
        rg:           mascararDado(r["Titular RG"]),
        cpf:          mascararDado(r["Titular CPF"]),
        nascimento:   String(r["Titular Nascimento"]    ||"").trim(),
        endereco:     mascararEndereco(r["Titular Endereço"]),
        exerceDirecao:String(r["Titular exerce direção"]||"").trim()},
      suplente:{nome:suplNome,
        telefone:  String(r["Suplente Telefone"] ||"").trim(),
        email:     String(r["Suplente Email"]    ||"").trim(),
        rg:        mascararDado(r["Suplente RG"]),
        cpf:       mascararDado(r["Suplente CPF"]),
        nascimento:String(r["Suplente Nascimento"]||"").trim(),
        endereco:  mascararEndereco(r["Suplente Endereço"])},
      oficio:oficioLink,confirmacaoOficio:confOficio,
      declaracao,nomeDeclarante,cargoDeclarante,
      mandatoAtual,impedido,oficioOk,substituicao,status:statusRenovacao
    };
  });
  return{ok:true,total:renovacoes.length,renovacoes};
}

// ────────────────────────────────────────────────────────────
// FUNÇÃO: getEntidades v2.2
//
// Novidades:
// - Lê DIRETOR, TELEFONE_ENT, EMAIL_ENT, CNPJ, OBSERVACAO, ID_CADEIRAS da aba entidades
// - Busca conselheiros por ID_CADEIRA (robusto) além do nome (fallback)
// - Separa conselheiros em "atuais" (por ID) e calcula impedimento por cadeira
// - Expõe "pendencias" (lista do que falta) para o tooltip/checklist do card
// - Status é calculado por cadeira individual, não só por entidade
// ────────────────────────────────────────────────────────────

function getEntidades(){
  const entAba    =getSheetData("entidades");
  const renResult =getRenovacoes();
  const insResult =getInscricoes();
  const consResult=getConselheiros();
  const avalResult=getAvaliacoes();
  const smResult  =getStatusManuais();

  // Mapas para cruzamento rápido
  const renMap={},inscMap={},avalMap={};
  (renResult.renovacoes||[]).forEach(r=>{renMap[normalizar(r.entidade)]=r;});
  (insResult.inscricoes||[]).forEach(i=>{inscMap[normalizar(i.nomeInstituicao)]=i;});
  (avalResult.avaliacoes||[]).forEach(a=>{
    const k=normalizar(a.entidade);
    if(!avalMap[k])avalMap[k]=[];
    avalMap[k].push(a);
  });
  const smMapa=smResult.statusManuais||{};

  // Mapa de conselheiros por ID_CADEIRA e por nome de entidade
  const consPorId={},consPorEnt={};
  (consResult.conselheiros||[]).forEach(c=>{
    if(c.idCadeira)consPorId[c.idCadeira]=c;
    const k=normalizar(c.entidade);
    if(!consPorEnt[k])consPorEnt[k]=[];
    consPorEnt[k].push(c);
  });

  const entidades=entAba
    .filter(r=>r["Nome da entidade"]&&String(r["Nome da entidade"]).trim()!=="")
    .map((r,idx)=>{
      const nome  =String(r["Nome da entidade"]).trim();
      const chave =normalizar(nome);
      const ren   =renMap[chave];
      const ins   =inscMap[chave];
      const avals =avalMap[chave]||[];
      const sm    =smMapa[chave];

      // Dados diretos da aba entidades (v3)
      const diretor      =String(r["DIRETOR"]       ||"").trim();
      const telefoneEnt  =String(r["TELEFONE_ENT"]  ||"").trim();
      const emailEnt     =String(r["EMAIL_ENT"]      ||"").trim();
      const cnpj         =String(r["CNPJ"]           ||"").trim();
      const obsEnt       =String(r["OBSERVACAO"]     ||"").trim();
      const segmento     =String(r["SEGMENTO"]       ||"").trim();
      const subtipo      =String(r["SUBTIPO"]        ||"").trim();

      // IDs de cadeiras vinculados a esta entidade
      const idCadeirasStr=String(r["ID_CADEIRAS"]   ||"").trim();
      const idCadeiras   =idCadeirasStr?idCadeirasStr.split(",").map(s=>s.trim()).filter(Boolean):[];

      // Conselheiros atuais — busca por ID primeiro, fallback por nome
      let consAtuais=[];
      if(idCadeiras.length){
        consAtuais=idCadeiras.map(id=>consPorId[id]).filter(Boolean);
      }
      if(!consAtuais.length){
        consAtuais=consPorEnt[chave]||[];
      }

      // ── Checklist de pendências ──
      // Determina o que está faltando para cada cadeira/posição desta entidade
      const pendencias=[];

      // 1. Conselheiros atuais: verificar impedimento por cadeira
      consAtuais.forEach(c=>{
        if(c.impedido){
          pendencias.push({
            tipo:"IMPEDIDO",
            descricao:`${c.cadeira||c.idCadeira||"Cadeira"}: ${c.nome} está no 2º mandato — não pode ser reconduzido`,
            idCadeira:c.idCadeira
          });
        }
      });

      // 2. Verificar dados da renovação
      if(ren){
        if(!ren.titular.nome)   pendencias.push({tipo:"SEM_TITULAR",   descricao:"Nome do titular não informado"});
        if(!ren.suplente.nome)  pendencias.push({tipo:"SEM_SUPLENTE",  descricao:"Nome do suplente não informado"});
        if(!ren.oficioOk)       pendencias.push({tipo:"SEM_OFICIO",    descricao:"Ofício não confirmado"});
        if(!ren.declaracao)     pendencias.push({tipo:"SEM_DECLARACAO",descricao:"Declaração não enviada"});
        if(ren.titular.exerceDirecao==="SIM"||ren.titular.exerceDirecao==="S")
          pendencias.push({tipo:"TITULAR_DIRECAO",descricao:`Titular (${ren.titular.nome}) exerce direção — verificar impedimento`});
      }

      // 3. Verificar inscrição (novas entidades)
      if(ins&&ins.docsFaltantes&&ins.docsFaltantes.length){
        pendencias.push({tipo:"DOCS_FALTANTES",descricao:"Docs faltantes: "+ins.docsFaltantes.join(", ")});
      }

      // 4. Sem nenhuma resposta
      if(!ren&&!ins){
        pendencias.push({tipo:"SEM_RESPOSTA",descricao:"Entidade ainda não respondeu o formulário"});
      }

      // ── Status automático ──
      // Lógica: se tem impedido → IMPEDIDO; se tem pendências críticas → PENDENTE;
      // se tudo resolvido → COMPLETO; senão SEM_RESPOSTA
      let statusAuto;
      const temImpedido=pendencias.some(p=>p.tipo==="IMPEDIDO");
      const pendCriticas=pendencias.filter(p=>!["TITULAR_DIRECAO"].includes(p.tipo));
      if(!ren&&!ins)                                       statusAuto="SEM_RESPOSTA";
      else if(temImpedido)                                 statusAuto="IMPEDIDO";
      else if(ren)                                         statusAuto=ren.status;
      else if(ins)                                         statusAuto=ins.statusGeral;
      else                                                 statusAuto="SEM_RESPOSTA";

      const temStatusManual=sm&&sm.statusManual&&sm.statusManual!=="";
      const status     =temStatusManual?sm.statusManual:statusAuto;
      // Tooltip: prioridade para obs manual, depois obs da entidade, depois pendências
      const observacao =temStatusManual&&sm.observacao ? sm.observacao
                       : obsEnt                        ? obsEnt
                       : pendCriticas.length           ? pendCriticas.map(p=>p.descricao).join(" · ")
                       : null;
      const statusFonte=temStatusManual?"MANUAL":"AUTOMATICO";

      return{
        id:idx+1, nome, status, statusAuto, statusFonte,
        observacao,
        segmento, subtipo,
        idCadeiras,
        // Dados diretos da entidade (v3)
        diretor, telefoneEnt, emailEnt, cnpj:cnpj||"",
        obsEnt,
        // Conselheiros vinculados
        consAtuais: consAtuais.map(c=>({
          nome:c.nome, cadeira:c.cadeira, idCadeira:c.idCadeira,
          mandato:c.mandato, impedido:c.impedido, status:c.status,
          email:c.email, telefone:c.telefone
        })),
        // Pendências calculadas
        pendencias,
        totalPendencias: pendencias.length,
        // Renovação e inscrição completas
        renovacao:  ren||null,
        inscricao:  ins||null,
        avaliacoes: avals,
        ultimaAvaliacao:avals.length>0?avals[avals.length-1]:null
      };
    });

  const resumo={
    total:      entidades.length,
    completo:   entidades.filter(e=>e.status==="COMPLETO").length,
    pendente:   entidades.filter(e=>e.status==="PENDENTE").length,
    impedido:   entidades.filter(e=>e.status==="IMPEDIDO").length,
    semResposta:entidades.filter(e=>e.status==="SEM_RESPOSTA"||e.status==="NAO_RESPONDEU").length,
    manuais:    entidades.filter(e=>e.statusFonte==="MANUAL").length
  };
  return{ok:true,resumo,entidades};
}

// ────────────────────────────────────────────────────────────
// FUNÇÃO: getInscricoes
// ────────────────────────────────────────────────────────────

function getInscricoes(){
  const rows=getSheetData("inscritos");
  const inscricoes=rows.map(r=>{
    const docs={
      estatuto:      String(r["Estatuto"]        ||"").trim(),
      ataFundacao:   String(r["Ata Fundação"]     ||"").trim(),
      ataEleicao:    String(r["Ata Eleição"]      ||"").trim(),
      docCNPJ:       String(r["Doc CNPJ"]         ||"").trim(),
      utilidadePubl: String(r["Utilidade Pública"]||"").trim(),
      docsPresidente:String(r["Docs Presidente"]  ||"").trim()
    };
    const docsOk=Object.values(docs).filter(v=>v!=="").length;
    const totalDocs=Object.keys(docs).length;
    const docsCompletos=docsOk===totalDocs;
    const docsFaltantes=Object.entries(docs).filter(([k,v])=>v==="").map(([k])=>k);
    const cnpjValido=validarCNPJ(r["CNPJ"]);
    let statusGeral;
    if(docsCompletos&&cnpjValido)statusGeral="COMPLETO";
    else if(docsOk>0)            statusGeral="INCOMPLETO";
    else                         statusGeral="PENDENTE";
    return{
      carimbo:r["Carimbo"]||"",
      nomeInstituicao:String(r["Nome Instituição"]||"").trim(),
      cnpj:    String(r["CNPJ"]          ||"").trim(),cnpjValido,
      fundacao:String(r["Fundação"]       ||"").trim(),
      endereco:mascararEndereco(r["Endereço"]),
      cep:     String(r["CEP"]           ||"").trim(),
      telefone:String(r["Telefone"]      ||"").trim(),
      email:   String(r["Email"]         ||"").trim(),
      segmento:String(r["Segmento"]      ||"").trim(),
      diretor: String(r["Diretor"]       ||"").trim(),
      telDiretor:   String(r["Tel Diretor"]  ||"").trim(),
      emailDiretor: String(r["Email Diretor"]||"").trim(),
      links:   String(r["Links"]         ||"").trim(),
      docs,docsOk,totalDocs,docsCompletos,docsFaltantes,statusGeral
    };
  });
  const resumo={total:inscricoes.length,
    completo:  inscricoes.filter(i=>i.statusGeral==="COMPLETO").length,
    incompleto:inscricoes.filter(i=>i.statusGeral==="INCOMPLETO").length,
    pendente:  inscricoes.filter(i=>i.statusGeral==="PENDENTE").length};
  return{ok:true,resumo,inscricoes};
}

// ────────────────────────────────────────────────────────────
// FUNÇÃO: getInconsistencias
// ────────────────────────────────────────────────────────────

function getInconsistencias(){
  const problemas=[];
  let regrasMap={};
  try{(getRegrasInconsistencias().regras||[]).forEach(r=>{regrasMap[r.id]=r;});}
  catch(e){["CPF_DUPLICADO","MANDATO_INVALIDO","DADOS_FALTANTES","CNPJ_INVALIDO","DOCS_FALTANTES",
    "SEM_RESPOSTA","CLS_MULTIPLAS_CADEIRAS","PRESTADOR_SEM_PAR","TITULAR_EXERCE_DIRECAO"]
    .forEach(id=>{regrasMap[id]={id,ativa:true,severidade:id==="SEM_RESPOSTA"?"INFO":"ALERTA"};});}
  const ativa =(id)=>regrasMap[id]?regrasMap[id].ativa:true;
  const sev   =(id)=>regrasMap[id]?(regrasMap[id].severidade||"ALERTA"):"ALERTA";
  const param =(id,n)=>{const r=regrasMap[id];if(!r)return null;return n===1?r.param1Valor:r.param2Valor;};

  const renovacoes  =getRenovacoes().renovacoes||[];
  const conselheiros=getConselheiros().conselheiros||[];
  const inscricoes  =getInscricoes().inscricoes||[];

  if(ativa("CPF_DUPLICADO")){
    const cpfsVis={};
    getSheetData("renovacoes").forEach(r=>{
      [["Titular CPF"],["Suplente CPF"]].forEach(([campo])=>{
        const cpf=String(r[campo]||"").replace(/\D/g,"");
        const ent=String(r["Nome completo da entidade"]||"").trim();
        if(cpf.length===11){
          if(cpfsVis[cpf])problemas.push({tipo:"CPF_DUPLICADO",severidade:sev("CPF_DUPLICADO"),
            descricao:`CPF ${campo.split(" ")[0].toLowerCase()} de "${ent}" já existe em "${cpfsVis[cpf]}"`,entidade:ent});
          else cpfsVis[cpf]=ent;
        }
      });
    });
  }
  if(ativa("MANDATO_INVALIDO")){
    const max=parseInt(param("MANDATO_INVALIDO",1))||2;
    renovacoes.forEach(r=>{
      if(r.impedido&&r.status!=="IMPEDIDO")
        problemas.push({tipo:"MANDATO_INVALIDO",severidade:sev("MANDATO_INVALIDO"),
          descricao:`"${r.entidade}" tem conselheiro com ${r.mandatoAtual}º mandato (máx. ${max})`,entidade:r.entidade});
    });
  }
  if(ativa("DADOS_FALTANTES")){
    renovacoes.forEach(r=>{
      const f=[];
      if(!r.titular.nome)f.push("nome do titular");
      if(!r.suplente.nome)f.push("nome do suplente");
      if(!r.oficioOk)f.push("ofício");
      if(!r.declaracao)f.push("declaração");
      if(f.length)problemas.push({tipo:"DADOS_FALTANTES",severidade:sev("DADOS_FALTANTES"),
        descricao:`Renovação de "${r.entidade}" incompleta: ${f.join(", ")}`,entidade:r.entidade,faltantes:f});
    });
  }
  if(ativa("CNPJ_INVALIDO")){
    [...renovacoes,...inscricoes].forEach(item=>{
      const nome=item.entidade||item.nomeInstituicao;
      if(item.cnpj&&!validarCNPJ(item.cnpj))
        problemas.push({tipo:"CNPJ_INVALIDO",severidade:sev("CNPJ_INVALIDO"),
          descricao:`CNPJ inválido para "${nome}": ${item.cnpj}`,entidade:nome});
    });
  }
  if(ativa("DOCS_FALTANTES")){
    inscricoes.forEach(i=>{
      if(i.docsFaltantes&&i.docsFaltantes.length)
        problemas.push({tipo:"DOCS_FALTANTES",severidade:sev("DOCS_FALTANTES"),
          descricao:`Inscrição de "${i.nomeInstituicao}" sem: ${i.docsFaltantes.join(", ")}`,
          entidade:i.nomeInstituicao,faltantes:i.docsFaltantes});
    });
  }
  if(ativa("SEM_RESPOSTA")){
    const lista=getSheetData("entidades").map(r=>String(r["Nome da entidade"]||"").trim()).filter(n=>n);
    const comResposta=new Set([...renovacoes.map(r=>normalizar(r.entidade)),...inscricoes.map(i=>normalizar(i.nomeInstituicao))]);
    lista.forEach(nome=>{
      if(!comResposta.has(normalizar(nome)))
        problemas.push({tipo:"SEM_RESPOSTA",severidade:sev("SEM_RESPOSTA"),
          descricao:`Entidade "${nome}" ainda não respondeu`,entidade:nome});
    });
  }
  if(ativa("CLS_MULTIPLAS_CADEIRAS")){
    const max=parseInt(param("CLS_MULTIPLAS_CADEIRAS",1))||3;
    const clsNome=param("CLS_MULTIPLAS_CADEIRAS",2)||"CLS Ind";
    const clsCons=conselheiros.filter(c=>normalizar(c.entidade).includes(normalizar(clsNome)));
    if(clsCons.length>max)
      problemas.push({tipo:"CLS_MULTIPLAS_CADEIRAS",severidade:sev("CLS_MULTIPLAS_CADEIRAS"),
        descricao:`"${clsNome}" ocupa ${clsCons.length} cadeiras (limite: ${max})`,entidade:clsNome});
  }
  if(ativa("PRESTADOR_SEM_PAR")){
    const pares={};
    conselheiros.forEach(c=>{
      const id=c.idCadeira||"";
      if(id.match(/^ID-P\d+-(T|S)$/)){
        const base=id.replace(/-(T|S)$/,"");
        if(!pares[base])pares[base]={T:null,S:null};
        pares[base][id.endsWith("-T")?"T":"S"]=c;
      }
    });
    Object.entries(pares).forEach(([base,par])=>{
      if(!par.T)problemas.push({tipo:"PRESTADOR_SEM_PAR",severidade:sev("PRESTADOR_SEM_PAR"),
        descricao:`Cadeira ${base}-T sem conselheiro`,entidade:base});
      if(!par.S)problemas.push({tipo:"PRESTADOR_SEM_PAR",severidade:sev("PRESTADOR_SEM_PAR"),
        descricao:`Cadeira ${base}-S sem conselheiro`,entidade:base});
    });
  }
  if(ativa("TITULAR_EXERCE_DIRECAO")){
    renovacoes.forEach(r=>{
      const ex=String(r.titular?.exerceDirecao||"").toUpperCase();
      if(ex==="SIM"||ex==="S")
        problemas.push({tipo:"TITULAR_EXERCE_DIRECAO",severidade:sev("TITULAR_EXERCE_DIRECAO"),
          descricao:`Titular de "${r.entidade}" exerce direção — verificar impedimento`,entidade:r.entidade});
    });
  }

  const resumo={total:problemas.length,
    critico:problemas.filter(p=>p.severidade==="CRITICO").length,
    alerta: problemas.filter(p=>p.severidade==="ALERTA").length,
    info:   problemas.filter(p=>p.severidade==="INFO").length};
  return{ok:true,resumo,inconsistencias:problemas};
}

// ────────────────────────────────────────────────────────────
// FUNÇÃO: getDashboard
// ────────────────────────────────────────────────────────────

function getDashboard(){
  const cfg=getConfigMap();
  const entResult=getEntidades(),consResult=getConselheiros(),incResult=getInconsistencias();
  const renResult=getRenovacoes(),insResult=getInscricoes();
  const totalCadeiras=parseInt(cfg.total_cadeiras)||32;
  const completos=entResult.resumo.completo||0;
  const progresso=totalCadeiras>0?Math.round((completos/totalCadeiras)*100):0;
  const segmentoMap={};
  (consResult.conselheiros||[]).forEach(c=>{segmentoMap[c.segmento]=(segmentoMap[c.segmento]||0)+1;});
  const substituicoes={nenhuma:0,parcial:0,total:0};
  (renResult.renovacoes||[]).forEach(r=>{substituicoes[r.substituicao]=(substituicoes[r.substituicao]||0)+1;});
  return{ok:true,municipio:cfg.municipio||"Município",anoMandato:cfg.ano_mandato||"2024-2026",
    dataAtualizacao:new Date().toISOString(),
    totais:{cadeiras:totalCadeiras,entidades:entResult.resumo.total,completos,
      pendentes:entResult.resumo.pendente,impedidos:consResult.impedidos,
      semResposta:entResult.resumo.semResposta,inscricoes:insResult.resumo.total,
      inconsistencias:incResult.resumo.total,manuais:entResult.resumo.manuais||0},
    progresso,
    fases:[{fase:"Envio de ofícios",status:"CONCLUIDO",data:""},{fase:"Recebimento respostas",status:"EM_ANDAMENTO",data:""},
           {fase:"Análise documental",status:"PENDENTE",data:""},{fase:"Homologação",status:"PENDENTE",data:""}],
    segmentos:segmentoMap,subtipos:consResult.subtipos||{},substituicoes,
    alertas:{criticos:incResult.resumo.critico,alertas:incResult.resumo.alerta,info:incResult.resumo.info,
      itens:(incResult.inconsistencias||[]).filter(i=>i.severidade!=="INFO").slice(0,5)}};
}

// ────────────────────────────────────────────────────────────
// AVALIACOES / CONFIG / ANOTACAO
// ────────────────────────────────────────────────────────────

function getAvaliacoes(){
  return{ok:true,total:0,avaliacoes:getSheetData("avaliacoes").map(r=>({
    entidade:  String(r["entidade"] ||"").trim(),
    timestamp: String(r["timestamp"]||"").trim(),
    autor:     String(r["autor"]    ||"").trim(),
    nota:      String(r["nota"]     ||"").trim(),
    anotacao:  String(r["anotacao"] ||"").trim()
  }))};
}

function saveAvaliacao(data){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet=ss.getSheetByName("avaliacoes");
  if(!sheet){sheet=ss.insertSheet("avaliacoes");sheet.appendRow(["entidade","timestamp","autor","nota","anotacao"]);}
  const ts=new Date().toISOString();
  sheet.appendRow([data.entidade||"",ts,data.autor||"admin",data.nota||"",data.anotacao||""]);
  return{ok:true,timestamp:ts};
}

function saveConfig(data){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet=ss.getSheetByName("config");
  if(!sheet){setupConfig2();sheet=ss.getSheetByName("config");}
  const rows=sheet.getDataRange().getValues();
  let found=false;
  for(let i=1;i<rows.length;i++){if(rows[i][0]===data.chave){sheet.getRange(i+1,2).setValue(data.valor);found=true;break;}}
  if(!found)sheet.appendRow([data.chave,data.valor,""]);
  return{ok:true};
}

function saveAnotacao(data){
  return saveAvaliacao({entidade:data.entidade,autor:data.autor||"admin",nota:data.nota||"",anotacao:data.anotacao||""});
}

// ────────────────────────────────────────────────────────────
// TESTES
// ────────────────────────────────────────────────────────────

function testar()            { Logger.log(JSON.stringify(getDashboard(),null,2)); }
function testarHealthCheck() { Logger.log(JSON.stringify(healthCheck(),null,2)); }
function testarEntidades()   { Logger.log(JSON.stringify(getEntidades(),null,2)); }
function testarRegras()      { Logger.log(JSON.stringify(getRegrasInconsistencias(),null,2)); }
function rodarSetup2()       { Logger.log(JSON.stringify(setupConfig2(),null,2)); }
function rodarSetup3()       { Logger.log(JSON.stringify(setupSheet3(),null,2)); }