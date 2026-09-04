// Portal de Estoque Kingspan Isoeste — consulta e contagem do estoque geral
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// Dados iniciais (usados apenas para popular a tabela na primeira vez, se ela estiver vazia)
const SEED_DATA = [{"item": "141590", "desc": "PAR. PB 12-14 2\" TCP3", "um": "Pç", "loc": "A-01-01-01", "qtd": "15925"}, {"item": "144236", "desc": "PAR FIX PB 12-14 X 1\"  P3", "um": "Pç", "loc": "A-01-01-03", "qtd": "13757"}, {"item": "140497", "desc": "BUCHA PLÁSTICA (PEAD) S-8", "um": "Pç", "loc": "A-01-01-05", "qtd": "38454"}, {"item": "143326", "desc": "PAR SEXT. 3/8\"  X 3/4\" GALV.", "um": "Pç", "loc": "A-01-02-01", "qtd": "5591"}, {"item": "141310", "desc": "PORCA SEXT GALV 3/8", "um": "Pç", "loc": "A-01-02-02", "qtd": "19369"}, {"item": "130153", "desc": "ARRUELA DE VEDACAO NEOBOND ID 1/4 X OD16MM", "um": "Pç", "loc": "A-01-02-03", "qtd": "38107"}, {"item": "140501", "desc": "PAR PHILIPS C/PA 4,8 X 38MM", "um": "Pç", "loc": "A-01-02-04", "qtd": "95742"}, {"item": "141652", "desc": "ACAB DE CANTO ARREDONDADO EM ALUMINIO (SL)", "um": "Pç", "loc": "A-01-03-01", "qtd": "3788"}, {"item": "140554", "desc": "ACAB DE CANTO ARREDONDADO EM ALUMINIO PRE-PINT (SL)", "um": "Pç", "loc": "A-01-03-02", "qtd": "337"}, {"item": "144266", "desc": "PAR HARDBOLT M8 X 75MM", "um": "PÇ", "loc": "A-01-03-03", "qtd": "2264"}, {"item": "132496", "desc": "CAPINHA P/ PARAFUSO ISOLUZ - 14/16 SW 8 - RAL5010", "um": "Pç", "loc": "A-01-03-04", "qtd": "5000"}, {"item": "144269", "desc": "PAR. FIX. TITECON M5 X 32MM - CHT PHS2", "um": "Pç", "loc": "A-01-03-05", "qtd": "4365"}, {"item": "139030", "desc": "PAR FIX PA 12-18 X 25MM PONTA AGULHA ARRUELA E16 JF3 INOX", "um": "UN", "loc": "A-01-03-06", "qtd": "8677"}, {"item": "131511i", "desc": "PAR FIX TROLDTEKT STRUCTURE SCREW IMP.", "um": "Pç", "loc": "A-01-03-07", "qtd": "1130"}, {"item": "144249", "desc": "PAR COSTURA PB1/4 - 14 X 7/8\" P1 RAL9003", "um": "Pç", "loc": "A-01-04-01", "qtd": "2100"}, {"item": "144295", "desc": "PAR FIX PB 1/4 - 14 X 7/8\" HWH 5/16\" P01 - INOX 304", "um": "Pç", "loc": "A-01-04-02", "qtd": "462"}, {"item": "930444", "desc": "PARAFUSO DABO VHT-R-4.8X60", "um": "PÇ", "loc": "A-01-04-03", "qtd": "91"}, {"item": "142943", "desc": "PAR FIX LSF PB 12-14 X 3/4\" P1", "um": "Pç", "loc": "A-01-04-04", "qtd": "3700"}, {"item": "132283", "desc": "PAR COSTURA PB1/4 - 14 X 7/8\" P1 - RAL 8012", "um": "UN", "loc": "A-01-04-05", "qtd": "4964"}, {"item": "142946", "desc": "BUCHA FU10 NYLON", "um": "Pç", "loc": "A-01-04-06", "qtd": "500"}, {"item": "144291", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1 - RAL7035", "um": "Pç", "loc": "A-01-04-07", "qtd": "128"}, {"item": "930364i", "desc": "971314-FIXA DRILL TEC PARAFUSO STD 12 4\"", "um": "Pç", "loc": "A-01-05-01", "qtd": "470"}, {"item": "146229", "desc": "GRAMPO DE METAL \"R\" 2.5 X 50MM - INOX", "um": "PÇ", "loc": "A-01-05-02", "qtd": "500"}, {"item": "149832", "desc": "CHUMBADOR MECÂNICO CBC - JAQUETA E CONE 1/4", "um": "PÇ", "loc": "A-01-05-03", "qtd": "117"}, {"item": "144289", "desc": "PAR FIX PB12-14 X 3/4 P3 - RAL5010", "um": "Pç", "loc": "A-01-05-04", "qtd": "250"}, {"item": "930091", "desc": "307476 - ARREMATE DE ENCONTRO DE MEMBRANAS T-JOINT- BRANCO", "um": "Pç", "loc": "A-01-05-05", "qtd": "2"}, {"item": "132514", "desc": "PARAFUSO DABO VHT-R-4.8X35", "um": "PÇ", "loc": "A-01-05-06", "qtd": "1000"}, {"item": "144197", "desc": "PORCA SEXT GALV 1/4", "um": "Pç", "loc": "A-01-05-07", "qtd": "550"}, {"item": "141599", "desc": "REBITE POP ALUMINIO BRANCO 3,2 X 10MM", "um": "Ct", "loc": "A-01-05-08", "qtd": "10"}, {"item": "144268", "desc": "PAR. FIX. TITECON M6 X 125MM SEXT. 5/16\"", "um": "Pç", "loc": "A-01-06-01", "qtd": "32000"}, {"item": "144271", "desc": "PAR FIX PB 12.1/4-14 X 4 P4 - RAL9003", "um": "Pç", "loc": "A-01-06-02", "qtd": "20000"}, {"item": "802785", "desc": "FITA VEDA ROSCA 18 X 50MM - AMANCO", "um": "Pç", "loc": "A-02-03-01", "qtd": "34"}, {"item": "142661", "desc": "ADESIVO DE VINIL TRANSPARENTE \"NÃO PISE\" - 210 X 74MM", "um": "Pç", "loc": "A-02-03-04", "qtd": "681"}, {"item": "142660", "desc": "ADESIVO DE VINIL TRANSPARENTE \"PISE AQUI\" - 210 X 74MM", "um": "Pç", "loc": "A-02-03-05", "qtd": "749"}, {"item": "801765", "desc": "TESOURA P/ CORTE DE AÇO (DIREITA) - IRWIN", "um": "Pç", "loc": "A-02-03-06", "qtd": "10"}, {"item": "801766", "desc": "TESOURA P/ CORTE DE AÇO (ESQUERDA) - IRWIN", "um": "Pç", "loc": "A-02-03-07", "qtd": "9"}, {"item": "802389", "desc": "FITA ISOLANTE", "um": "Pç", "loc": "A-02-03-09", "qtd": "30"}, {"item": "132719", "desc": "PORCA INOX M4", "um": "Pç", "loc": "A-02-04-01", "qtd": "250"}, {"item": "141672", "desc": "BORRACHA P/ VEDAÇÃO PORTA (SL)", "um": "M", "loc": "A-02-04-01", "qtd": "20"}, {"item": "933031i", "desc": "PAR 10 - 1 1/2\" Sextavado ponta agulha (SHINGLE STONE)", "um": "PÇ", "loc": "A-02-04-02", "qtd": "2000"}, {"item": "144259", "desc": "PAR FIX PB 12.1/4-14 X 3.1/4 P4 - RAL1015", "um": "Pç", "loc": "A-02-04-03", "qtd": "789"}, {"item": "130248", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1 - RAL8023", "um": "Pç", "loc": "A-02-04-04", "qtd": "8242"}, {"item": "131249", "desc": "PAR FIX PB12.1/4-14 X 2\" P4 - RAL7035", "um": "UN", "loc": "A-02-04-05", "qtd": "1800"}, {"item": "131243", "desc": "PAR FIX PB12.1/4-14 X 2\" P1 (AÇO LEVE LSF/MADEIRA) RAL9003", "um": "UN", "loc": "A-02-04-06", "qtd": "1250"}, {"item": "930450i", "desc": "PARAFUSO DABO TKR 4-4.8 x 110", "um": "PÇ", "loc": "A-02-04-07", "qtd": "750"}, {"item": "140002", "desc": "CHUMBADOR ARS 3/8", "um": "Pç", "loc": "A-02-04-08", "qtd": "423"}, {"item": "141640", "desc": "PAR FIX PB 5.5/6.3 x 172mm P4", "um": "Pç", "loc": "A-02-05-01", "qtd": "1000"}, {"item": "144258", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1 - RAL1015", "um": "Pç", "loc": "A-02-05-03", "qtd": "6340"}, {"item": "133480", "desc": "PAR FIX PB 12.1/4-14 X 4 P4 - RAL1015", "um": "Pç", "loc": "A-02-05-04", "qtd": "1000"}, {"item": "147294", "desc": "PAR PA 6,0 X 100MM C/ ARRUELA - INOX", "um": "PÇ", "loc": "A-02-05-05", "qtd": "2000"}, {"item": "130802", "desc": "PARAFUSO P/ CHAPA FINA EJOT DABO VHT- R - 4.8 X 200", "um": "PÇ", "loc": "A-02-05-06", "qtd": "300"}, {"item": "147285", "desc": "OLHO MÁGICO - PORTA GSL", "um": "Pç", "loc": "A-02-05-07", "qtd": "4"}, {"item": "124051", "desc": "STRIKE", "um": "UN", "loc": "A-02-05-08", "qtd": "15"}, {"item": "141580", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1", "um": "Pç", "loc": "A-02-06-01", "qtd": "80000"}, {"item": "141591", "desc": "PAR FIX PB 12.1/4-14 X 3.1/4 P4", "um": "Pç", "loc": "A-02-06-01", "qtd": "25000"}, {"item": "142914", "desc": "PAR FIX PB 12-1/4\"\"-14 X 2.3/8\"\" P4", "um": "Pç", "loc": "A-03-01-01", "qtd": "6555"}, {"item": "144268", "desc": "PAR. FIX. TITECON M6 X 125MM SEXT. 5/16\"", "um": "Pç", "loc": "A-03-01-02", "qtd": "3816"}, {"item": "142918", "desc": "PAR. FIX. TITECON M6 X 100MM SEXT. 5/16\"", "um": "Pç", "loc": "A-03-01-03", "qtd": "9847"}, {"item": "141557", "desc": "REBITE POP ALUMINIO BRANCO 4,0 X 15MM", "um": "Ct", "loc": "A-03-02-01", "qtd": "2926"}, {"item": "142913", "desc": "PAR FIX PB 12.1/4-14 X 4 P4", "um": "Pç", "loc": "A-03-02-02", "qtd": "10807"}, {"item": "130339", "desc": "PAR FIX PB 12-24 X 1.1/2\" P5", "um": "Pç", "loc": "A-03-03-01", "qtd": "2390"}, {"item": "141714", "desc": "PARAFUSO VHT R 4,8 X 120MM", "um": "PÇ", "loc": "A-03-03-02", "qtd": "2080"}, {"item": "132720", "desc": "REBITE ROSCADO M4,0 x 10MM", "um": "Ct", "loc": "A-03-03-03", "qtd": "197"}, {"item": "132243", "desc": "PAR. FIX. TITECON M6 X 45MM SEXT. 5/16\"", "um": "Pç", "loc": "A-03-03-04", "qtd": "12302"}, {"item": "930390i", "desc": "PARAFUSO FIXAÇÃO 35MM P/MADEIRA - TELHA RESIDENCE RAL8012", "um": "PÇ", "loc": "A-03-03-05", "qtd": "4980"}, {"item": "996686", "desc": "PARAFUSO JBS - R 7.5 X 80", "um": "PÇ", "loc": "A-03-03-06", "qtd": "2000"}, {"item": "130770", "desc": "PAR INOX MQ/ CH/ PH/ MA 4x40", "um": "Pç", "loc": "A-03-03-07", "qtd": "200"}, {"item": "142899", "desc": "ANEL DE VEDAÇAO 5/16", "um": "Pç", "loc": "A-03-04-01", "qtd": "2200"}, {"item": "930571i", "desc": "PAR 8- 3/4\" Sextavado c/ arruela EPDM ponta agulha (SHINGLE)", "um": "PÇ", "loc": "A-03-04-02", "qtd": "1500"}, {"item": "933032i", "desc": "PAR 10 - 1\" Cabeça chata PHS ponta agulha (SHINGLE STONE)", "um": "PÇ", "loc": "A-03-04-03", "qtd": "1750"}, {"item": "930570i", "desc": "Par 10 - 3\" Sextavado ponta agulha (SHINGLE STONE)", "um": "Pç", "loc": "A-03-04-04", "qtd": "1250"}, {"item": "930728i", "desc": "PAR 10 - 1 1/2\" PANCAKE PONTA AGULHA (SHINGLE STONE)", "um": "PÇ", "loc": "A-03-04-05", "qtd": "11230"}, {"item": "131246", "desc": "PAR FIX PB12.1/4-14 X 2\" P4 - RAL1015", "um": "UN", "loc": "A-03-04-06", "qtd": "2200"}, {"item": "930450", "desc": "PARAFUSO DABO TKR 4-4.8 x 110", "um": "PÇ", "loc": "A-03-04-07", "qtd": "3000"}, {"item": "131263", "desc": "PARAFUSO COSTURA PB 1/4 -14 X 7/8\" P1 - INOX", "um": "Pç", "loc": "A-03-05-01", "qtd": "840"}, {"item": "144268", "desc": "PAR. FIX. TITECON M6 X 125MM SEXT. 5/16\"", "um": "Pç", "loc": "A-03-05-01", "qtd": "25600"}, {"item": "132249", "desc": "PAR PB 4,2x13MM P02 K-LATH INOX", "um": "Pç", "loc": "A-03-05-02", "qtd": "11900"}, {"item": "144271", "desc": "PAR FIX PB 12.1/4-14 X 4 P4 - RAL9003", "um": "Pç", "loc": "A-03-05-02", "qtd": "35000"}, {"item": "710000", "desc": "CANETA ESFEROGRAFICA PRETA", "um": "Pç", "loc": "ARMARIO 01", "qtd": "140"}, {"item": "710043", "desc": "PILHA AA", "um": "Pç", "loc": "ARMARIO 01", "qtd": "156"}, {"item": "712082", "desc": "GRAMPO P/ GRAMPEADOR 26/6 (CX C/5000 UNID)", "um": "CX", "loc": "ARMARIO 01", "qtd": "10"}, {"item": "712091", "desc": "EXTRATOR DE GRAMPO", "um": "pç", "loc": "ARMARIO 01", "qtd": "36"}, {"item": "712105", "desc": "CANETA ESFEROGRAFICA AZUL", "um": "Pç", "loc": "ARMARIO 01", "qtd": "50"}, {"item": "712108", "desc": "PILHA AAA", "um": "Pç", "loc": "ARMARIO 01", "qtd": "64"}, {"item": "712109", "desc": "ESTILETE GRANDE", "um": "Pç", "loc": "ARMARIO 01", "qtd": "70"}, {"item": "712110", "desc": "CANETA MARCA TEXTO", "um": "Pç", "loc": "ARMARIO 01", "qtd": "36"}, {"item": "712120", "desc": "LAMINA DE ESTILETE (GRANDE)", "um": "Pç", "loc": "ARMARIO 01", "qtd": "140"}, {"item": "712123", "desc": "MARCADOR PERMANENTE 2.0MM AZUL", "um": "Pç", "loc": "ARMARIO 01", "qtd": "12"}, {"item": "142916", "desc": "PAR FIX PB 12-14 X 1.1/2\" P3", "um": "Pç", "loc": "B-01-01-01", "qtd": "2215"}, {"item": "144271", "desc": "PAR FIX PB 12.1/4-14 X 4 P4 - RAL9003", "um": "Pç", "loc": "B-01-01-02", "qtd": "13092"}, {"item": "141591", "desc": "PAR FIX PB 12.1/4-14 X 3.1/4 P4", "um": "Pç", "loc": "B-01-01-03", "qtd": "29027"}, {"item": "140003", "desc": "PAR FIX PB 12.1/4-14 X 5 P4", "um": "Pç", "loc": "B-01-02-01", "qtd": "2169"}, {"item": "141594", "desc": "PAR PB 8 x 1/2 P02 K-LATH RAL9003", "um": "Pç", "loc": "B-01-02-02", "qtd": "132285"}, {"item": "141314", "desc": "ARRUELA LISA GALV 3/8", "um": "Pç", "loc": "B-01-02-03", "qtd": "21355"}, {"item": "141580", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1", "um": "Pç", "loc": "B-01-02-04", "qtd": "60320"}, {"item": "131556i", "desc": "FITA PRETA INFERIOR PARA ISOLUZ 50MM X 33M SEMIPERMEÁVEL", "um": "UN", "loc": "B-01-03-01", "qtd": "80"}, {"item": "131555i", "desc": "FITA BRANCA SUPERIOR PARA ISOLUZ 50MM X 33M IMPERMEÁVEL", "um": "UN", "loc": "B-01-03-02", "qtd": "135"}, {"item": "144267", "desc": "PAR FIX PB 12.1/4-14 X 4\" P1", "um": "Pç", "loc": "B-01-03-03", "qtd": "5336"}, {"item": "144261", "desc": "PAR FIX PB 12.1/4 -14 X 6 P4", "um": "Pç", "loc": "B-01-03-04", "qtd": "981"}, {"item": "150024", "desc": "PAR INOX FENDA C/E 4,8 X 38MM", "um": "Pç", "loc": "B-01-03-05", "qtd": "11250"}, {"item": "139026", "desc": "PAR FIX PB12-14 X 3/4 P3 - RAL7035", "um": "Pç", "loc": "B-01-04-01", "qtd": "140"}, {"item": "140525", "desc": "PORCA SEXT GALV 5/16", "um": "Pç", "loc": "B-01-04-02", "qtd": "244"}, {"item": "130801", "desc": "PARAFUSO P/GESSO-TROMBETA M4,2X70MM-PONTA AGULHA FOSFATIZADO", "um": "PÇ", "loc": "B-01-04-03", "qtd": "3000"}, {"item": "143159", "desc": "ARRUELA 32MM - THRULOK", "um": "Pç", "loc": "B-01-04-04", "qtd": "127"}, {"item": "131570", "desc": "PAR FIX PB 12.1/4-14 X 4 P4 - RAL7035", "um": "Pç", "loc": "B-01-04-05", "qtd": "270"}, {"item": "142942", "desc": "ARRUELA GALVANIZADA 5/16 (TELHA)", "um": "Pç", "loc": "B-01-04-06", "qtd": "699"}, {"item": "144395", "desc": "PARAFUSO DABO TKR 4.8X35", "um": "Pç", "loc": "B-01-04-07", "qtd": "400"}, {"item": "131630", "desc": "PAR FIX PB12.1/4-14 X 2\" P4", "um": "UN", "loc": "B-01-04-08", "qtd": "1101"}, {"item": "140497", "desc": "BUCHA PLÁSTICA (PEAD) S-8", "um": "Pç", "loc": "B-01-05-01", "qtd": "42000"}, {"item": "141559", "desc": "REBITE DE ALUMINIO 4,0 X 16MM", "um": "Ct", "loc": "B-01-05-01", "qtd": "1000"}, {"item": "140003", "desc": "PAR FIX PB 12.1/4-14 X 5 P4", "um": "Pç", "loc": "B-01-05-02", "qtd": "30400"}, {"item": "144275", "desc": "PAR FIX PB 12.1/4-14 X 5 P4 - RAL9003", "um": "Pç", "loc": "B-02-01-01", "qtd": "4230"}, {"item": "141315", "desc": "ARRUELA DE VEDACAO NEOBOND ID 1/4 X OD 7/8", "um": "Pç", "loc": "B-02-01-02", "qtd": "19552"}, {"item": "142938", "desc": "PAR. FIX. TITECON M6 X 70MM SEXT. 5/16\"", "um": "Pç", "loc": "B-02-01-03", "qtd": "1422"}, {"item": "540711", "desc": "PAR ME FIX PB 10 16x5/8\" PANCAKE PHS2 TCP3 XIN BRA 5", "um": "PÇ", "loc": "B-02-01-04", "qtd": "29016"}, {"item": "132500", "desc": "ARRUELA DE VEDAÇÃO GOIVA P/ ISOLUZ AZUL RAL5010", "um": "Pç", "loc": "B-02-01-05", "qtd": "3585"}, {"item": "144079", "desc": "PAR FIX PB12-14 X 3/4 P3", "um": "Pç", "loc": "B-02-02-01", "qtd": "33261"}, {"item": "141639", "desc": "REBITE POP ALUMINIO CINZA 4,0 X 15MM - RAL9006", "um": "Ct", "loc": "B-02-02-03", "qtd": "657"}, {"item": "132738", "desc": "REBITE ALUMINIO 4,8 X 22MM", "um": "Ct", "loc": "B-02-02-04", "qtd": "414"}, {"item": "141558", "desc": "REBITE INOX 4,0 X 15MM", "um": "Ct", "loc": "B-02-02-05", "qtd": "1584"}, {"item": "144278", "desc": "PAR FIX PB12-14 X 3/4 P3 - RAL9003", "um": "Pç", "loc": "B-02-03-01", "qtd": "19890"}, {"item": "142915", "desc": "PAR FIX PB 12-14 X 1.3/4 CABEÇA CHATA C/ ASA P3", "um": "Pç", "loc": "B-02-03-02", "qtd": "7099"}, {"item": "144235", "desc": "PAR FIX PB1/4-14 X 7/8 P3", "um": "Pç", "loc": "B-02-03-03", "qtd": "2950"}, {"item": "144254", "desc": "PAR P/ MADEIRA 6,0 X 90MM RAL8023 CE", "um": "Pç", "loc": "B-02-03-04", "qtd": "7345"}, {"item": "144284", "desc": "PAR. FIX. TITECON M5 X 45MM - CHT PHS2", "um": "Pç", "loc": "B-02-03-05", "qtd": "3125"}, {"item": "143213", "desc": "JUNÇÃO P/ HASTE ROSCADA GALV 3/8\"", "um": "Pç", "loc": "B-02-03-06", "qtd": "1287"}, {"item": "131629", "desc": "PAR FIX PB12.1/4-14 X 2\" P1 (AÇO LEVE LSF/MADEIRA)", "um": "UN", "loc": "B-02-04-01", "qtd": "1020"}, {"item": "131569", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1 - RAL9006", "um": "Pç", "loc": "B-02-04-02", "qtd": "259"}, {"item": "132513", "desc": "PARAFUSO DABO TKR 4-4.8 X 90", "um": "PÇ", "loc": "B-02-04-03", "qtd": "250"}, {"item": "144367", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1 - RAL7016", "um": "Pç", "loc": "B-02-04-04", "qtd": "2122"}, {"item": "930377", "desc": "PARAFUSO DABO VHT-R-4.8X50", "um": "PÇ", "loc": "B-02-04-06", "qtd": "420"}, {"item": "140534", "desc": "ARRUELA LISA GALV 5/16", "um": "Pç", "loc": "B-02-04-07", "qtd": "7755"}, {"item": "600817", "desc": "FITA ARQUEAR 13MM", "um": "Pç", "loc": "B-02-05-01", "qtd": "12"}, {"item": "142913", "desc": "PAR FIX PB 12.1/4-14 X 4 P4", "um": "Pç", "loc": "B-02-05-02", "qtd": "40000"}, {"item": "144255", "desc": "PAR P/ MADEIRA 6,0 X 90MM ZI", "um": "Pç", "loc": "B-03-01-01", "qtd": "6355"}, {"item": "130249", "desc": "PAR FIX PB 12.1/4-14 X 3.1/4 P4 - RAL8023", "um": "Pç", "loc": "B-03-01-02", "qtd": "7560"}, {"item": "130001", "desc": "CHUMBADOR PARABOLT 5/16 X 3 1/4", "um": "Pç", "loc": "B-03-01-03", "qtd": "2174"}, {"item": "142001", "desc": "PAR FIX PB 12-14 X 3.1/4 CABEÇA CHATA C/ ASA P4", "um": "Pç", "loc": "B-03-01-04", "qtd": "3822"}, {"item": "144281", "desc": "PAR COSTURA PB1/4-14 X 7/8 P1 - RAL9003", "um": "Pç", "loc": "B-03-01-05", "qtd": "33839"}, {"item": "130520", "desc": "REBITE HERMETICO 4,0 X 15MM", "um": "Ct", "loc": "B-03-02-01", "qtd": "219"}, {"item": "140505", "desc": "REBITE ALUMINIO  3,2 X 10MM", "um": "Ct", "loc": "B-03-02-02", "qtd": "645"}, {"item": "141559", "desc": "REBITE DE ALUMINIO 4,0 X 16MM", "um": "Ct", "loc": "B-03-02-03", "qtd": "630"}, {"item": "130251", "desc": "REBITE HERMETICO 4,0 X 15MM - RAL8023", "um": "Ct", "loc": "B-03-02-04", "qtd": "196"}, {"item": "130519", "desc": "REBITE ALUMINIO 4,8 X 15MM", "um": "Ct", "loc": "B-03-02-05", "qtd": "80"}, {"item": "141747", "desc": "PAR FIX PB 6.5/7 X 120MM ARRUELA E19 P1", "um": "Pç", "loc": "B-03-03-01", "qtd": "3100"}, {"item": "130594", "desc": "ESPAÇADOR PARA MONTAGEM DE CREATIVE WALL", "um": "UN", "loc": "B-03-03-02", "qtd": "727"}, {"item": "930389i", "desc": "PARAFUSO FIXAÇÃO 35MM P/MADEIRA - TELHA RESIDENCE RAL7016", "um": "PÇ", "loc": "B-03-03-03", "qtd": "10744"}, {"item": "147293", "desc": "PAR PA 6,0 X 100MM C/ ARRUELA - ORGANOMETÁLICO", "um": "PÇ", "loc": "B-03-03-04", "qtd": "4000"}, {"item": "930463", "desc": "BUCHA HTK-2G-50x35", "um": "PÇ", "loc": "B-03-03-05", "qtd": "180"}, {"item": "144368", "desc": "PAR FIX PB12-14 X 3/4 P3 - RAL7016", "um": "Pç", "loc": "B-03-03-06", "qtd": "3700"}, {"item": "132511", "desc": "BUCHA HTK-2G-50X145", "um": "PÇ", "loc": "B-03-04-01", "qtd": "800"}, {"item": "131247", "desc": "PAR FIX PB12.1/4-14 X 2\" P4 - RAL8023", "um": "UN", "loc": "B-03-04-02", "qtd": "4200"}, {"item": "144242", "desc": "PAR P/ CONCRETO 6,0 X 70MM RAL7016", "um": "Pç", "loc": "B-03-04-03", "qtd": "3601"}, {"item": "144241", "desc": "PAR P/ CONCRETO 6,0 X 70MM RAL7035", "um": "Pç", "loc": "B-03-04-04", "qtd": "2000"}, {"item": "144239", "desc": "PAR P/ CONCRETO 6,0 X 70MM RAL8023", "um": "Pç", "loc": "B-03-04-05", "qtd": "2500"}, {"item": "144238", "desc": "PAR P/ CONCRETO 6,0 X 70MM RAL1015", "um": "Pç", "loc": "B-03-04-06", "qtd": "2000"}, {"item": "132738", "desc": "REBITE ALUMINIO 4,8 X 22MM", "um": "Ct", "loc": "B-03-05-01", "qtd": "350"}, {"item": "144261", "desc": "PAR FIX PB 12.1/4 -14 X 6 P4", "um": "Pç", "loc": "B-03-05-01", "qtd": "11600"}, {"item": "143100", "desc": "FITA TELHA/TERÇA 50MM X 2MM X 10M", "um": "RL", "loc": "B-03-05-02", "qtd": "235"}, {"item": "144002", "desc": "PAR FIX PB 1/4 - 20 X 5\" CABEÇA CHATA C/ASA P03", "um": "Pç", "loc": "C-01-01-01", "qtd": "3042"}, {"item": "144085", "desc": "PAR FIX PB12-14 X 2 1/4 CABEÇA CHATA COM ASA P3", "um": "Pç", "loc": "C-01-01-02", "qtd": "9280"}, {"item": "141742", "desc": "PAR FIX PB 12.1/4-14 X 3.1/4 P4", "um": "Pç", "loc": "C-01-01-03", "qtd": "4977"}, {"item": "141741", "desc": "PAR FIX PB 12-1-4 -14 X 2.3-8 P4", "um": "Pç", "loc": "C-01-01-04", "qtd": "5000"}, {"item": "130497", "desc": "PAR FIX PB 12 X 1.1/2\" P1", "um": "Pç", "loc": "C-01-01-05", "qtd": "1600"}, {"item": "131197", "desc": "FITA DUPLA FACE VHB 4910 9.5MM X 1,0MM X 10M", "um": "RL", "loc": "C-01-01-06", "qtd": "52"}, {"item": "714379", "desc": "ETIQUETA DE ROLO 100 X 100MM", "um": "UN", "loc": "C-01-02-01", "qtd": "203"}, {"item": "712196", "desc": "PAPEL SULFITE RECICLADO", "um": "RE", "loc": "C-01-02-02", "qtd": "101"}, {"item": "714385", "desc": "ETIQUETA DE ROLO 150 X 210MM", "um": "UN", "loc": "C-01-02-03", "qtd": "86"}, {"item": "712493", "desc": "MANGUEIRA PU 10MM", "um": "M", "loc": "C-01-03-01", "qtd": "500"}, {"item": "712504", "desc": "MANGUEIRA PU 16MM", "um": "M", "loc": "C-01-03-02", "qtd": "550"}, {"item": "714386", "desc": "RIBBON MISTO - K200 (160MM X 450M)", "um": "Pç", "loc": "C-01-03-05", "qtd": "60"}, {"item": "714381", "desc": "RIBBON MISTO - K200 (110MM X 450M)", "um": "UN", "loc": "C-01-03-06", "qtd": "88"}, {"item": "143164i", "desc": "MEMBRANA PVC S/ REFORÇO 250 X 1.5MM X 20M RAL7046", "um": "Pç", "loc": "C-01-04-01", "qtd": "4"}, {"item": "710167", "desc": "PAPEL HIGIÊNICO FOLHA SIMPLES ROLO 8X 400M ESSENZ HRS118", "um": "FD", "loc": "C-01-05-01", "qtd": "60"}, {"item": "800042", "desc": "PAPEL MANILHA MARROM 1200MM", "um": "Pç", "loc": "C-02-01-02", "qtd": "19"}, {"item": "144088", "desc": "ARRUELA DE FIXAÇÃO PASSANTE COM PORCA", "um": "Pç", "loc": "C-02-02-01", "qtd": "1181"}, {"item": "144246", "desc": "PAR FIX PB12.1/4 - 14 X 3.1/4\" P4 RAL9003", "um": "Pç", "loc": "C-02-02-02", "qtd": "40158"}, {"item": "130140", "desc": "ARRUELA LISA GALV. 10  X 32 X 3MM", "um": "Pç", "loc": "C-02-02-03", "qtd": "325"}, {"item": "144072", "desc": "ARRUELA LISA 1/4", "um": "Pç", "loc": "C-02-02-04", "qtd": "580"}, {"item": "141623", "desc": "PAR PB 8 x 1/2 P02 K-LATH (SEM PINTURA)", "um": "Pç", "loc": "C-02-02-05", "qtd": "7200"}, {"item": "144290", "desc": "PAR FIX 3,5 X 25MM (GN25) FOSFATIZADO PONTA AGULHA P/ GESSO", "um": "Pç", "loc": "C-02-02-06", "qtd": "153"}, {"item": "132482", "desc": "PRATO DE FIXAÇÃO COBERTURA COM MEMBRANA 0,8 X 40MM", "um": "Pç", "loc": "C-02-02-07", "qtd": "12900"}, {"item": "143101", "desc": "FITA TELHA/TERÇA METÁLICA", "um": "M", "loc": "C-02-03-01", "qtd": "3570"}, {"item": "712416", "desc": "ESCOVA DE AÇO TIPO COPO ONDULADA 4\" - STARRET", "um": "Pç", "loc": "C-02-03-03", "qtd": "50"}, {"item": "141347", "desc": "PAR FIX PB12-14 X 3/4 P3 - RAL1011", "um": "Pç", "loc": "C-02-03-04", "qtd": "5418"}, {"item": "144286", "desc": "PAR FIX PB 18. 9 X 1\" P1", "um": "Pç", "loc": "C-02-03-05", "qtd": "500"}, {"item": "131473", "desc": "PAR P/ MADEIRA 6,5 X 65MM EJOGUARD", "um": "PÇ", "loc": "C-02-03-06", "qtd": "100"}, {"item": "140368", "desc": "FITA LATERAL 95MM - ESQUERDA - P100", "um": "M", "loc": "C-02-04-01", "qtd": "80000"}, {"item": "140365", "desc": "FITA LATERAL 65MM - ESQUERDA", "um": "M", "loc": "C-02-04-02", "qtd": "87000"}, {"item": "132215", "desc": "TAMPA PLÁSTICA AIRBRISE 50MM X 150MM PRETA", "um": "Pç", "loc": "C-02-05-02", "qtd": "3215"}, {"item": "130614", "desc": "JOELHO PVC SOLDÁVEL 20 X Ø 1/2\" C/ ROSCA  - AMANCO", "um": "PÇ", "loc": "C-03-01-03", "qtd": "1170"}, {"item": "130401", "desc": "T  SOLDAVEL 20MM - AMANCO", "um": "Pç", "loc": "C-03-01-04", "qtd": "1900"}, {"item": "130400", "desc": "JOELHO 90º SOLDAVEL 20MM - AMANCO", "um": "Pç", "loc": "C-03-01-05", "qtd": "850"}, {"item": "149771", "desc": "FILME DE PROTEÇÃO P/ TRANSPASSE DE ISOTELHA LARG 150MM", "um": "Kg", "loc": "C-03-02-01", "qtd": "145,4"}, {"item": "123312", "desc": "FILME DE PROTEÇÃO P/ TRANSPASSE DE ISOTELHA LARG 300MM", "um": "Kg", "loc": "C-03-02-02", "qtd": "243,8"}, {"item": "149772", "desc": "FILME DE PROTEÇÃO P/ TRANSPASSE DE ISOTELHA LARG 200MM", "um": "Kg", "loc": "C-03-02-04", "qtd": "87,3"}, {"item": "123311", "desc": "FILME DE PROTEÇÃO P/ TRANSPASSE DE ISOTELHA LARG 250MM", "um": "Kg", "loc": "C-03-02-05", "qtd": "124,31"}, {"item": "804386", "desc": "APLICADOR DE MASSA VEDANTE ( 600 ML)", "um": "Pç", "loc": "C-03-03-01", "qtd": "21"}, {"item": "143136", "desc": "VALVULA EQ DE PRESSAO PEQUENA (C/AQUEC)", "um": "Pç", "loc": "C-03-03-02", "qtd": "21"}, {"item": "131912", "desc": "REGISTRO POSTERIOR UNIVERSAL", "um": "Pç", "loc": "C-03-03-03", "qtd": "1"}, {"item": "131250", "desc": "PAR FIX PB12.1/4-14 X 2\" P4 - RAL7016", "um": "UN", "loc": "C-03-03-04", "qtd": "7827"}, {"item": "142913", "desc": "PAR FIX PB 12.1/4-14 X 4 P4", "um": "Pç", "loc": "C-03-04-01", "qtd": "29200"}, {"item": "143112", "desc": "VEDA ONDA SUPERIOR TP-40 - PUR", "um": "Pç", "loc": "C-03-04-02", "qtd": "482"}, {"item": "142234", "desc": "VALVULA EQ DE PRESSAO GRANDE (C/ TUBO DE AQUEC)", "um": "PÇ", "loc": "C-03-05-01", "qtd": "20"}, {"item": "141650", "desc": "CANTONEIRA ALUM. ARREDONDADA (SL) (111003)", "um": "M", "loc": "CANT A-01", "qtd": "2880"}, {"item": "130063", "desc": "PERFIL ALUM. PORTA CADEIRINHA C/ VEDAÇÃO GSL50 (111015)", "um": "M", "loc": "CANT A-02", "qtd": "180"}, {"item": "132004", "desc": "PERFIL ALUM. FACHADA I -  RAL9006 (111017)", "um": "M", "loc": "CANT A-02", "qtd": "12"}, {"item": "132005", "desc": "PERFIL ALUM. FACHADA II - RAL9006 (111018)", "um": "M", "loc": "CANT A-02", "qtd": "12"}, {"item": "132118", "desc": "PERFIL ACABAMENTO ABERTURAS EVO. ALUM. BASE-RAL9006(132057)", "um": "M", "loc": "CANT A-02", "qtd": "24"}, {"item": "140986", "desc": "RODA FORRO ARREDONDADO ALUMÍNIO", "um": "M", "loc": "CANT A-02", "qtd": "12"}, {"item": "140992", "desc": "PERFIL VISOR VIDRO SIMPLES - RAL9003 ALUMÍNIO", "um": "M", "loc": "CANT A-02", "qtd": "1440"}, {"item": "146255", "desc": "PERFIL ALUM. U 20 X 50 X 20MM ANODIZADO (146251)", "um": "M", "loc": "CANT A-02", "qtd": "894"}, {"item": "131968", "desc": "PERFIL ALUM. FACHADA I - RAL9003  (131965)", "um": "M", "loc": "CANT A-03", "qtd": "330"}, {"item": "131969", "desc": "PERFIL ALUM. FACHADA II - RAL9003 (131966)", "um": "M", "loc": "CANT A-03", "qtd": "330"}, {"item": "131965", "desc": "PERFIL ALUM. FACHADA I -  (111017)", "um": "M", "loc": "CANT A-04", "qtd": "144"}, {"item": "131966", "desc": "PERFIL ALUM. FACHADA II - (111018)", "um": "M", "loc": "CANT A-04", "qtd": "6"}, {"item": "132113", "desc": "PERFIL ALUM. FACHADA I - RAL 5002 (111017)", "um": "M", "loc": "CANT A-04", "qtd": "6"}, {"item": "132114", "desc": "PERFIL ALUM. FACHADA II - RAL 5002 (111018)", "um": "M", "loc": "CANT A-04", "qtd": "6"}, {"item": "140553", "desc": "CANTONEIRA ALUM. PRE-PINT.60 X 60 X 2MM (SL)(111024)", "um": "M", "loc": "CANT A-04", "qtd": "276"}, {"item": "140990", "desc": "PERFIL ALUM. U 15 X 50 X15MM (SL)(111023) - RAL9003 ALUMÍNIO", "um": "M", "loc": "CANT A-04", "qtd": "258"}, {"item": "141657", "desc": "PERFIL ALUM. BATENTE P/ PORTA DE CORRER (SL)(111047)", "um": "M", "loc": "CANT A-04", "qtd": "12"}, {"item": "142279", "desc": "PERFIL U 50 X 100 X 50MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT B-01", "qtd": "39"}, {"item": "146072", "desc": "PERFIL U 50 X 120 X 50MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT B-02", "qtd": "483"}, {"item": "140533", "desc": "CANTONEIRA 50 X 125MM EXT - RAL9003 0,50MM", "um": "M", "loc": "CANT B-03", "qtd": "894"}, {"item": "144312", "desc": "CANTONEIRA 40 X 40MM EXT - RAL9003 0,50MM", "um": "M", "loc": "CANT B-04", "qtd": "2499"}, {"item": "140527", "desc": "CANTONEIRA 50 X 50MM INT - RAL9003 0,50MM", "um": "M", "loc": "CANT C-01", "qtd": "156"}, {"item": "140528", "desc": "CANTONEIRA 50 X 50MM EXT - RAL9003 0,50MM", "um": "M", "loc": "CANT C-02", "qtd": "437"}, {"item": "140535", "desc": "CANTONEIRA 50 X 100MM EXT - RAL9003 0,50MM", "um": "M", "loc": "CANT C-03", "qtd": "846"}, {"item": "140531", "desc": "PERFIL U 19 X 50 X 19MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT C-04", "qtd": "195"}, {"item": "142797", "desc": "PERFIL ANDORINHA RAL9003/PRIMER 0,50MM", "um": "M", "loc": "CANT D-01", "qtd": "624"}, {"item": "144308", "desc": "CANTONEIRA 30 X 30MM INT - RAL9003 0,50MM", "um": "M", "loc": "CANT D-01", "qtd": "978"}, {"item": "144313", "desc": "CANTONEIRA 40 X 40MM INT - RAL9003 0,50MM", "um": "M", "loc": "CANT D-02", "qtd": "2118"}, {"item": "141571", "desc": "PERFIL U 19 X 100 X 19MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT D-03", "qtd": "774"}, {"item": "140529", "desc": "PERFIL T 25 X 70MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT D-04", "qtd": "489"}, {"item": "140552", "desc": "CANTONEIRA ALUM.  ARREDONDADA RAL9003  (SL) (111003)", "um": "M", "loc": "CANT E-01", "qtd": "2008"}, {"item": "141573", "desc": "PERFIL U 19 X 150 X 19MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT E-02", "qtd": "582"}, {"item": "132052", "desc": "SUPORTE INFERIOR EVO. ALUM. NATURAL INÍCIO RECORTADO", "um": "M", "loc": "CANT E-03", "qtd": "156"}, {"item": "132150", "desc": "PERFIL SUPORTE INFERIOR EVO 50MM NO PISO ALUMINIO", "um": "M", "loc": "CANT E-03", "qtd": "186"}, {"item": "133054", "desc": "PERFIL ALUM. U 19 X 50 X 19MM BRANCO BM (111051)", "um": "M", "loc": "CANT E-03", "qtd": "666"}, {"item": "143618", "desc": "RODA FORRO ARREDONDADO PRE -PINT (RAL9003)", "um": "M", "loc": "CANT E-03", "qtd": "312"}, {"item": "132002", "desc": "PERFIL ALUM. FACHADA I -  RAL7035 (111017)", "um": "M", "loc": "CANT E-04", "qtd": "144"}, {"item": "132003", "desc": "PERFIL ALUM. FACHADA II - RAL7035 (111018)", "um": "M", "loc": "CANT E-04", "qtd": "144"}, {"item": "132026", "desc": "PERFIL ALUM. FACHADA I -  RAL6002 (111017)", "um": "M", "loc": "CANT E-04", "qtd": "78"}, {"item": "132027", "desc": "PERFIL ALUM. FACHADA II - RAL6002 (111018)", "um": "M", "loc": "CANT E-04", "qtd": "78"}, {"item": "141654", "desc": "CANTONEIRA ALUM. 60 X 60 X 2MM (SL)(111024)", "um": "M", "loc": "CANT E-04", "qtd": "918"}, {"item": "141669", "desc": "CANTONEIRA ALUM. 19 X 19 X 2MM (SL)(111013)", "um": "M", "loc": "CANT E-04", "qtd": "384"}, {"item": "141687", "desc": "CANTONEIRA ALUM. PRÉ-PINT 19 X 19 X 2MM (SL)(141669)", "um": "M", "loc": "CANT E-04", "qtd": "216"}, {"item": "146066", "desc": "PERFIL U 50 X 50 X 50MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT F-01", "qtd": "897"}, {"item": "141565", "desc": "CANTONEIRA 50 X 150MM EXT - RAL9003 0,50MM", "um": "M", "loc": "CANT F-02", "qtd": "432"}, {"item": "141576", "desc": "PERFIL U 19 X 32 X 19MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT F-03", "qtd": "636"}, {"item": "146122", "desc": "PERFIL ANDORINHA RAL9003/PRIMER 0,50MM P50", "um": "Pç", "loc": "CANT F-04", "qtd": "508"}, {"item": "146068", "desc": "PERFIL U 50 X 70 X 50MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT G-01", "qtd": "534"}, {"item": "144314", "desc": "CANTONEIRA 40 X 140MM EXT - RAL9003 0,50MM", "um": "M", "loc": "CANT G-02", "qtd": "18"}, {"item": "141581", "desc": "PERFIL U 19 X 70 X 19MM - RAL9003/PRIM 0,50 EXT", "um": "M", "loc": "CANT G-03", "qtd": "1149"}, {"item": "141566", "desc": "CANTONEIRA 50 X 175MM EXT - RAL9003 0,50MM", "um": "M", "loc": "CANT G-04", "qtd": "366"}, {"item": "111017", "desc": "P. AL FACHADA I (131965)", "um": "M", "loc": "CHAO", "qtd": "1722"}, {"item": "111018", "desc": "P. AL FACHADA II (131966)", "um": "M", "loc": "CHAO", "qtd": "1830"}, {"item": "130402", "desc": "TUBO PVC SOLDAVEL 1/2\"  (BARRA 6M) - AMANCO", "um": "Pç", "loc": "CHAO", "qtd": "220"}, {"item": "131718", "desc": "PERFIL CARTOLA P/ FORRO EM LAJE DE CONCRETO", "um": "Pç", "loc": "CHAO", "qtd": "171"}, {"item": "131951", "desc": "DOBRADIÇA PORTA VAI E VEM  14013", "um": "Pç", "loc": "CHAO", "qtd": "12"}, {"item": "132492", "desc": "CHAPA DE AÇO GALV 100 X 100 X 3MM", "um": "Pç", "loc": "CHAO", "qtd": "6265"}, {"item": "133120", "desc": "FILME PROTETIVO DE POLIETILENO COM UV LARG. 1150 X 0,040MM", "um": "KG", "loc": "CHAO", "qtd": "161,5"}, {"item": "133121", "desc": "FILME PROTETIVO DE POLIETILENO LARG. 1150MM - VERMELHO", "um": "KG", "loc": "CHAO", "qtd": "1193,6"}, {"item": "140004", "desc": "TUBO PVC 100 X 300 - AMANCO", "um": "Pç", "loc": "CHAO", "qtd": "1161"}, {"item": "140097", "desc": "CANTONEIRA 38 X 38MM EM PVC RÍGIDO (ÂNGULO RETO)", "um": "M", "loc": "CHAO", "qtd": "1656"}, {"item": "140360", "desc": "GAXETA VEDAÇÃO ¾ EVOLUTION", "um": "M", "loc": "CHAO", "qtd": "96"}, {"item": "141357", "desc": "FILME ALUMINIO 1000 X 0,051MM", "um": "Kg", "loc": "CHAO", "qtd": "967,5"}, {"item": "142558", "desc": "PERFIL ALUM. T 85 X 75 X 2MM (111005)", "um": "M", "loc": "CHAO", "qtd": "3390"}, {"item": "142559", "desc": "PERFIL ALUM. T 85 X 75 X 2MM (PINTADO)", "um": "M", "loc": "CHAO", "qtd": "3714"}, {"item": "142699", "desc": "SUPORTE U AIRBRISE 50x150 - 48X148X48 L=50MM GALVA 2MM", "um": "PÇ", "loc": "CHAO", "qtd": "64"}, {"item": "142977", "desc": "RUFO DE TOPO DENTADO TP-40 PIR 3TP-RAL9003 0,50MM", "um": "PÇ", "loc": "CHAO", "qtd": "4"}, {"item": "143123", "desc": "CANTONEIRA ARREDONDADA EM PVC PEQ.", "um": "M", "loc": "CHAO", "qtd": "410"}, {"item": "143185", "desc": "CHAPA DE AÇO GALV 100 X 100 X 2MM", "um": "Pç", "loc": "CHAO", "qtd": "17968"}, {"item": "143212", "desc": "HASTE ROSCADA GALV 3/8 X 1000MM C/ FIX", "um": "Pç", "loc": "CHAO", "qtd": "2150"}, {"item": "143215", "desc": "HASTE ROSCADA GALV 3/8 X 1000MM", "um": "Pç", "loc": "CHAO", "qtd": "2863"}, {"item": "143217", "desc": "HASTE ROSCADA GALV 3/8 X 2000MM C/ FIX", "um": "Pç", "loc": "CHAO", "qtd": "1080"}, {"item": "143218", "desc": "HASTE ROSCADA GALV 3/8 X 3000MM C/ FIX", "um": "Pç", "loc": "CHAO", "qtd": "1851"}, {"item": "143408", "desc": "CHAPA DE AÇO GALV 250 X 250 X 3,00MM C/ PORCA 3/8\" SOLDADA", "um": "Pç", "loc": "CHAO", "qtd": "2972"}, {"item": "144018", "desc": "HASTE ROSCADA GALV 3/8 X 2000MM", "um": "Pç", "loc": "CHAO", "qtd": "800"}, {"item": "144019", "desc": "HASTE ROSCADA GALV 3/8 X 3000MM", "um": "Pç", "loc": "CHAO", "qtd": "1036"}, {"item": "144059", "desc": "MASSA VEDANTE TELHAS (BRANCO) - 600ML", "um": "Pç", "loc": "CHAO", "qtd": "2352"}, {"item": "146139", "desc": "SUP. CONTRAVENTO - 50X50X100X4,75MM GALV - LONG. MET", "um": "PÇ", "loc": "CHAO", "qtd": "2143"}, {"item": "146140", "desc": "SUP. CONTRAVENTO - 50X150X100X4,75MM GALV - CONCR.", "um": "PÇ", "loc": "CHAO", "qtd": "43"}, {"item": "147000", "desc": "CLIP FIXO ZIPADA-RAL9003/PRIM 0,65MM", "um": "Pç", "loc": "CHAO", "qtd": "348"}, {"item": "147002", "desc": "BASE DESLIZANTE-RAL9003/PRIM 0,80MM", "um": "Pç", "loc": "CHAO", "qtd": "3555"}, {"item": "147013", "desc": "CLIP FIXO ZIPADA-GALVA 0,65MM", "um": "Pç", "loc": "CHAO", "qtd": "1650"}, {"item": "147014", "desc": "CLIP DESLIZANTE ZIPADA-GALVA 0,65MM", "um": "Pç", "loc": "CHAO", "qtd": "80"}, {"item": "149244", "desc": "SUPORTE INFERIOR P/ FACHADAS CORTADAS 50MM", "um": "Pç", "loc": "CHAO", "qtd": "334"}, {"item": "149245", "desc": "SUPORTE INFERIOR P/ FACHADAS CORTADAS 70MM", "um": "Pç", "loc": "CHAO", "qtd": "2695"}, {"item": "150010", "desc": "VISOR SALA LIMPA 950 X 2000 X 100MM", "um": "Pç", "loc": "CHAO", "qtd": "11"}, {"item": "151780", "desc": "CLIPE INFINITY E LYNE WALL 0,43MM - L=80MM", "um": "UN", "loc": "CHAO", "qtd": "18916"}, {"item": "540712", "desc": "RB-SUPORTE INFERIOR EVOLUTION/ISOFACHADA 50MM", "um": "Pç", "loc": "CHAO", "qtd": "644"}, {"item": "540713", "desc": "RB-SUPORTE INFERIOR EVOLUTION/ISOFACHADA 70MM", "um": "Pç", "loc": "CHAO", "qtd": "7"}, {"item": "600002", "desc": "TAMBOR PLASTICO 20 L (BOMBONA)", "um": "Pç", "loc": "CHAO", "qtd": "40"}, {"item": "600004", "desc": "TAMBOR PLASTICO 50 L (BOMBONA)", "um": "Pç", "loc": "CHAO", "qtd": "121"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "CHAO", "qtd": "652"}, {"item": "600014", "desc": "FILME PLÁSTICO BRANCO C/ LOGO - 1500 X 0,060MM", "um": "Kg", "loc": "CHAO", "qtd": "3539,3"}, {"item": "600016", "desc": "CALÇO EPE / SKIN 60 BR 260 X 150 X 40 MM", "um": "Pç", "loc": "CHAO", "qtd": "8160"}, {"item": "700027", "desc": "SACO PEAD TRANSP LISO 12+124+12 X 160 X 0,03", "um": "UN", "loc": "CHAO", "qtd": "8750"}, {"item": "710166", "desc": "PAPEL TOALHA SIMPLES INTERFOLHA 3 DOBRAS 2400 FS 22X23CM", "um": "FD", "loc": "CHAO", "qtd": "80"}, {"item": "710167", "desc": "PAPEL HIGIÊNICO FOLHA SIMPLES ROLO 8X 400M ESSENZ HRS118", "um": "FD", "loc": "CHAO", "qtd": "91"}, {"item": "996815", "desc": "COLA CASCOLA EXTRA FORTE ( 16,3 LT)", "um": "BD", "loc": "CHAO", "qtd": "1"}, {"item": "600012", "desc": "FILME STRETCH 50 X 0,025MM", "um": "Kg", "loc": "CHÃO", "qtd": "554,83"}, {"item": "800759", "desc": "SERRA CIRC WIDEA 9.1/4POL  X 80 DT  BOSCH (COD:2608642197)", "um": "Pç", "loc": "D-01-03-03", "qtd": "68"}, {"item": "143107", "desc": "VEDA ONDA SUPERIOR ZIP450 20MM S/ADESIVO", "um": "Pç", "loc": "D-01-03-04", "qtd": "440"}, {"item": "930099i", "desc": "310508 - PASSARELA DE TPO ( WALKWAY ) 863,6MM X 15,24M", "um": "Pç", "loc": "D-01-03-05", "qtd": "1"}, {"item": "143039", "desc": "VEDA ONDA SUPERIOR TELHA ONDULADA - ESP.20MM X 45MM ALT.", "um": "Pç", "loc": "D-02-03-02", "qtd": "8"}, {"item": "132214", "desc": "TAMPA PLÁSTICA AIRBRISE 50MM X 95MM PRETA", "um": "Pç", "loc": "D-02-03-03", "qtd": "2900"}, {"item": "139035", "desc": "CLIPE CONECTOR MC4 PARA MÓDULO", "um": "PÇ", "loc": "D-02-03-04", "qtd": "664"}, {"item": "139036", "desc": "CLIPE CONECTOR MC4 PARA ISOTELHA", "um": "PÇ", "loc": "D-02-03-05", "qtd": "640"}, {"item": "600837", "desc": "SACO PLASTICO C/T 085 X 160 X 12 X 0,04 - CHAPAS", "um": "Pç", "loc": "D-02-04-01", "qtd": "1720"}, {"item": "712620", "desc": "CAIXA P/ ARQUIVO MORTO", "um": "UN", "loc": "D-03-01-01", "qtd": "150"}, {"item": "930443", "desc": "PARAFUSO DABO TKR 4.8X60", "um": "PÇ", "loc": "D-03-02-01", "qtd": "7889"}, {"item": "130145", "desc": "PAR TAPPER 1/4\" X 2.3/4\"-SILVER SEXTAVADO 5/16", "um": "Pç", "loc": "D-03-02-02", "qtd": "2500"}, {"item": "131244", "desc": "PAR FIX PB12.1/4-14 X 2\" P1 (AÇO LEVE LSF/MADEIRA) RAL7035", "um": "UN", "loc": "D-03-02-03", "qtd": "2000"}, {"item": "131241", "desc": "PAR FIX PB12.1/4-14 X 2\" P1 (AÇO LEVE LSF/MADEIRA) RAL1015", "um": "UN", "loc": "D-03-02-04", "qtd": "5528"}, {"item": "131626", "desc": "PAR FIX CABEÇA LENTILHA TORX PB 6-5.5 X 25MM P3 INOX 316", "um": "Pç", "loc": "D-03-02-05", "qtd": "18261"}, {"item": "710015", "desc": "CATÁLOGO DE RECOMENDAÇÕES GERAIS (DESCARGA DE TELHAS)", "um": "Pç", "loc": "D-03-03-01", "qtd": "2000"}, {"item": "132248", "desc": "TAMPA PLÁSTICA UNDERLINE 4 POLEGADAS PRETA", "um": "PÇ", "loc": "D-03-03-02", "qtd": "608"}, {"item": "141153", "desc": "SERRA CIRCULAR INFINIT SAN 355 X 2,0 X 2,6 X 25,4 X 120Z", "um": "Pç", "loc": "D-03-03-03", "qtd": "4"}, {"item": "132309", "desc": "TAMPA PLÁSTICA AIRBRISE 40MM X 80MM PRETA", "um": "Pç", "loc": "D-03-03-04", "qtd": "2456"}, {"item": "144010", "desc": "MANTA ALUMINIZADA  VED1000 - 10CM X  10,21M (COD 10171)", "um": "M", "loc": "D-03-03-06", "qtd": "255,25"}, {"item": "144293", "desc": "PAR FIX PB12 14 X 3.1/4\" P1", "um": "Pç", "loc": "D-03-03-07", "qtd": "12150"}, {"item": "132247", "desc": "TAMPA PLÁSTICA UNDERLINE 6 POLEGADAS PRETA", "um": "PÇ", "loc": "D-03-04-01", "qtd": "1947"}, {"item": "143113", "desc": "VEDA ONDA INFERIOR TP-40", "um": "Pç", "loc": "D-03-04-02", "qtd": "964"}, {"item": "149859", "desc": "SERRA FITA SUL CORTE KOMBAT 20 X 0,90 X 10/14 X 7,22", "um": "Pç", "loc": "D-03-05-01", "qtd": "95"}, {"item": "132305", "desc": "TAMPA PLÁSTICA AIRBRISE 100MM X 200MM PRETA", "um": "Pç", "loc": "D-03-05-02", "qtd": "436"}, {"item": "140371", "desc": "FITA LATERAL 150MM - ESQUERDA - P150", "um": "M", "loc": "E-01-02-03", "qtd": "24000"}, {"item": "140372", "desc": "FITA LATERAL 150MM - DIREITA - P150", "um": "M", "loc": "E-01-02-04", "qtd": "16000"}, {"item": "140659", "desc": "LONA PLÁSTICA PRETA (BOBINA 8 X 50M) - NOVO", "um": "M2", "loc": "E-01-03-02", "qtd": "3200"}, {"item": "140363", "desc": "FITA LATERAL 50MM - DIREITA", "um": "M", "loc": "E-01-04-02", "qtd": "216000"}, {"item": "140368", "desc": "FITA LATERAL 95MM - ESQUERDA - P100", "um": "M", "loc": "E-02-01-01", "qtd": "36000"}, {"item": "140367", "desc": "FITA LATERAL 95MM - DIREITA - P100", "um": "M", "loc": "E-02-01-02", "qtd": "69000"}, {"item": "149736", "desc": "FITA LATERAL 25MM - ESQUERDA", "um": "M", "loc": "E-02-02-01", "qtd": "308000"}, {"item": "149737", "desc": "FITA LATERAL 25MM - DIREITA", "um": "M", "loc": "E-02-02-02", "qtd": "236000"}, {"item": "140364", "desc": "FITA LATERAL 50MM - ESQUERDA", "um": "M", "loc": "E-02-03-01", "qtd": "28000"}, {"item": "140363", "desc": "FITA LATERAL 50MM - DIREITA", "um": "M", "loc": "E-02-03-02", "qtd": "88000"}, {"item": "141557", "desc": "REBITE POP ALUMINIO BRANCO 4,0 X 15MM", "um": "Ct", "loc": "E-02-03-02", "qtd": "2100"}, {"item": "140374", "desc": "FITA LATERAL 200MM - ESQUERDA - P200", "um": "M", "loc": "E-02-05-01", "qtd": "32000"}, {"item": "140373", "desc": "FITA LATERAL 200MM - DIREITA - P200", "um": "M", "loc": "E-02-05-02", "qtd": "33000"}, {"item": "140365", "desc": "FITA LATERAL 65MM - ESQUERDA", "um": "M", "loc": "E-03-01-01", "qtd": "77000"}, {"item": "140366", "desc": "FITA LATERAL 65MM - DIREITA", "um": "M", "loc": "E-03-01-02", "qtd": "84000"}, {"item": "140375", "desc": "FITA LATERAL 38MM - ESQUERDA", "um": "M", "loc": "E-03-02-01", "qtd": "176000"}, {"item": "140376", "desc": "FITA LATERAL 38MM - DIREITA", "um": "M", "loc": "E-03-02-02", "qtd": "220000"}, {"item": "140366", "desc": "FITA LATERAL 65MM - DIREITA", "um": "M", "loc": "E-03-03-01", "qtd": "92000"}, {"item": "996613i", "desc": "FITA BUTÍLICA P/ VEDAÇÃO DE PAINEL DE POLICARBONATO 50MMX35M", "um": "RL", "loc": "E-03-03-02", "qtd": "43"}, {"item": "140365", "desc": "FITA LATERAL 65MM - ESQUERDA", "um": "M", "loc": "E-03-04-01", "qtd": "100000"}, {"item": "145400", "desc": "CLIPE CONCEPT WALL 0,65MM", "um": "Pç", "loc": "E-03-04-02", "qtd": "10000"}, {"item": "712594", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº44", "um": "PR", "loc": "EPI PALLET 01", "qtd": "5"}, {"item": "712595", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº45", "um": "PR", "loc": "EPI PALLET 01", "qtd": "2"}, {"item": "712596", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº36", "um": "PR", "loc": "EPI PALLET 01", "qtd": "1"}, {"item": "712597", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº37", "um": "PR", "loc": "EPI PALLET 01", "qtd": "4"}, {"item": "712598", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº38", "um": "PR", "loc": "EPI PALLET 01", "qtd": "10"}, {"item": "712599", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº39", "um": "PR", "loc": "EPI PALLET 01", "qtd": "8"}, {"item": "712607", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº47", "um": "PR", "loc": "EPI PALLET 01", "qtd": "3"}, {"item": "712608", "desc": "BOTINA DE SEGURANÇA C/BIQUEIRA COMPOSITE Nº46", "um": "PR", "loc": "EPI PALLET 01", "qtd": "2"}, {"item": "712522", "desc": "CAMISA SOCIAL MASC. ML AZUL MARINHO - M", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "42"}, {"item": "712523", "desc": "CAMISA SOCIAL MASC. ML AZUL MARINHO - G", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "49"}, {"item": "712525", "desc": "CAMISA SOCIAL MASC. ML AZUL MARINHO - XG", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "10"}, {"item": "712526", "desc": "CAMISA SOCIAL MASC. ML AZUL MARINHO - XGG (G1)", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "14"}, {"item": "712527", "desc": "CAMISA SOCIAL MASC. ML AZUL MARINHO - P", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "40"}, {"item": "712534", "desc": "CAMISETA COM PROTEÇÃO UV - TAM P", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "20"}, {"item": "712535", "desc": "CAMISETA COM PROTEÇÃO UV - TAM M", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "40"}, {"item": "712536", "desc": "CAMISETA COM PROTEÇÃO UV - TAM G", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "20"}, {"item": "712537", "desc": "CAMISETA COM PROTEÇÃO UV - GG", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "20"}, {"item": "712538", "desc": "CAMISETA COM PROTEÇÃO UV - EXG (G2)", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "20"}, {"item": "712548", "desc": "CAMISETA EM MALHA PV AZUL MARINHO - TAMANHO XGG (G1)", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "14"}, {"item": "712565", "desc": "CAMISETA EM MALHA PV AZUL MARINHO - TAMANHO G", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "20"}, {"item": "800086", "desc": "CAMISETA EM MALHA PV AZUL MARINHO - TAMANHO M", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "30"}, {"item": "800100", "desc": "CAMISETA EM MALHA PV AZUL MARINHO ML - TAM.EXGG (G3)", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "12"}, {"item": "800102", "desc": "CAMISETA GOLA POLO AZUL MARINHO - TAMANHO EXGG (G3)", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "7"}, {"item": "800147", "desc": "CAMISETA EM MALHA PV AZUL MARINHO ML - TAM.XGG (G1)", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "7"}, {"item": "800765", "desc": "CAMISA DE BRIGADA - TAMANHO P", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "8"}, {"item": "800766", "desc": "CAMISA DE BRIGADA - TAMANHO M", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "26"}, {"item": "800767", "desc": "CAMISA DE BRIGADA - TAMANHO G", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "12"}, {"item": "800768", "desc": "CAMISA DE BRIGADA - TAMANHO GG", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "14"}, {"item": "800769", "desc": "CAMISA DE BRIGADA - TAM. EXGG (G3)", "um": "Pç", "loc": "EPI PALLET 02", "qtd": "8"}, {"item": "712516", "desc": "CAMISA SOCIAL FEMIN. ML AZUL FRANÇA - GG", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "10"}, {"item": "712518", "desc": "CAMISA SOCIAL FEMIN. ML AZUL MARINHO - P", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "20"}, {"item": "712519", "desc": "CAMISA SOCIAL FEMIN. ML AZUL MARINHO - M", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "55"}, {"item": "712520", "desc": "CAMISA SOCIAL FEMIN. ML AZUL MARINHO - G", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "70"}, {"item": "712544", "desc": "CAMISA SOCIAL FEMIN. ML AZUL MARINHO - EXG (G2)", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "5"}, {"item": "712577", "desc": "CAMISA SOCIAL FEMIN. ML AZUL MARINHO - PP", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "12"}, {"item": "800786", "desc": "CAMISETA FEMININA GOLA POLO AZUL MARINHO ? TAM PP", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "31"}, {"item": "800787", "desc": "CAMISETA FEMININA GOLA POLO AZUL MARINHO - TAM P", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "10"}, {"item": "800788", "desc": "CAMISETA FEMININA GOLA POLO AZUL MARINHO - TAM M", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "41"}, {"item": "800789", "desc": "CAMISETA FEMININA GOLA POLO AZUL MARINHO - TAM G", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "20"}, {"item": "800790", "desc": "CAMISETA FEMININA GOLA POLO AZUL MARINHO - TAM GG", "um": "Pç", "loc": "EPI PALLET 03", "qtd": "56"}, {"item": "710074", "desc": "CAPA DE CHUVA", "um": "Pç", "loc": "EPI PALLET 04", "qtd": "2"}, {"item": "712205", "desc": "AVENTAL EM COURO TIPO BARBEIRO", "um": "Pç", "loc": "EPI PALLET 04", "qtd": "5"}, {"item": "712252", "desc": "AVENTAL EM COURO TIPO SOLDADOR", "um": "Pç", "loc": "EPI PALLET 04", "qtd": "1"}, {"item": "712352", "desc": "LUVA NITRILICA CANO LONGO TAMANHO M", "um": "PR", "loc": "EPI PALLET 04", "qtd": "55"}, {"item": "712353", "desc": "LUVA NITRILICA CANO LONGO TAMANHO G", "um": "PR", "loc": "EPI PALLET 04", "qtd": "31"}, {"item": "712357", "desc": "CINTO DE SEGURANÇA (PARAQUEDISTA)", "um": "PÇ", "loc": "EPI PALLET 04", "qtd": "6"}, {"item": "714510", "desc": "JAQUETA S/ CAPUS - TAM EXGG (G3)", "um": "Pç", "loc": "EPI PALLET 04", "qtd": "2"}, {"item": "710079", "desc": "CAPA DE CHUVA TIPO MOTOQUEIRO - P", "um": "Pç", "loc": "EPI PALLET 05", "qtd": "9"}, {"item": "710080", "desc": "CAPA DE CHUVA TIPO MOTOQUEIRO - M", "um": "Pç", "loc": "EPI PALLET 05", "qtd": "23"}, {"item": "710081", "desc": "CAPA DE CHUVA TIPO MOTOQUEIRO - G", "um": "Pç", "loc": "EPI PALLET 05", "qtd": "5"}, {"item": "710082", "desc": "CAPA DE CHUVA TIPO MOTOQUEIRO - GG", "um": "Pç", "loc": "EPI PALLET 05", "qtd": "8"}, {"item": "712211", "desc": "LUVA TRICOTADA EMBORRACHADA N°8", "um": "PR", "loc": "EPI PALLET 05", "qtd": "48"}, {"item": "712356", "desc": "OCULOS DE PROTEÇÃO (ESCURO)", "um": "Pç", "loc": "EPI PALLET 05", "qtd": "20"}, {"item": "712358", "desc": "LUVA TRICOTADA EMBORRACHADA N°9", "um": "PR", "loc": "EPI PALLET 05", "qtd": "40"}, {"item": "712370", "desc": "CAPACETE DE SEGURANÇA CLASSE B", "um": "Pç", "loc": "EPI PALLET 05", "qtd": "8"}, {"item": "712407", "desc": "LUVA NITRILICA DESCARTÁVEL AZUL - TAM ''G''", "um": "CX", "loc": "EPI PALLET 05", "qtd": "18"}, {"item": "712580", "desc": "LUVA HYFLEX Nº 8", "um": "PR", "loc": "EPI PALLET 05", "qtd": "36"}, {"item": "712581", "desc": "LUVA HYFLEX Nº 9", "um": "PR", "loc": "EPI PALLET 05", "qtd": "36"}, {"item": "140659", "desc": "LONA PLÁSTICA PRETA (BOBINA 8 X 50M) - NOVO", "um": "M2", "loc": "F-01-01-02", "qtd": "2247"}, {"item": "800009", "desc": "SELO DE AÇO P/ FITA 1\"  X 60 MM SIMPLES", "um": "Kg", "loc": "F-01-02-01", "qtd": "50"}, {"item": "143010", "desc": "ACAB TRAPEZOIDAL C/P TP-40 PIR 3TP 20MM-RAL9003 0,43", "um": "M", "loc": "F-01-02-03", "qtd": "79"}, {"item": "140370", "desc": "FITA LATERAL 120MM - DIREITA - P120", "um": "M", "loc": "F-01-03-01", "qtd": "29000"}, {"item": "140369", "desc": "FITA LATERAL 120MM - ESQUERDA - P120", "um": "M", "loc": "F-01-03-02", "qtd": "22000"}, {"item": "710167", "desc": "PAPEL HIGIÊNICO FOLHA SIMPLES ROLO 8X 400M ESSENZ HRS118", "um": "FD", "loc": "F-01-05-01", "qtd": "50"}, {"item": "145400", "desc": "CLIPE CONCEPT WALL 0,65MM", "um": "Pç", "loc": "F-02-01-01", "qtd": "12000"}, {"item": "145400", "desc": "CLIPE CONCEPT WALL 0,65MM", "um": "Pç", "loc": "F-02-01-02", "qtd": "26442"}, {"item": "143034", "desc": "ACAB TRAPEZOIDAL C/P TP-40 PIR 3TP 50MM-RAL9003 0,43", "um": "M", "loc": "F-02-02-01", "qtd": "890"}, {"item": "143019", "desc": "ACAB TRAPEZOIDAL C/P TP-40 PIR 3TP 30MM-RAL9003 0,43", "um": "M", "loc": "F-02-02-02", "qtd": "256"}, {"item": "800005", "desc": "FITA FILAMENTOSA 50 X 50MM", "um": "Pç", "loc": "F-02-03-01", "qtd": "84"}, {"item": "712229", "desc": "FITA CREPE 50MM X 50M", "um": "Pç", "loc": "F-02-03-02", "qtd": "53"}, {"item": "600820", "desc": "FITA ADESIVA 45 X 100M", "um": "Pç", "loc": "F-02-03-03", "qtd": "1180"}, {"item": "142919", "desc": "TINTA EMBORRACHADA BRANCA - GALÃO 3,60L", "um": "UN", "loc": "F-02-04-01", "qtd": "35"}, {"item": "600820", "desc": "FITA ADESIVA 45 X 100M", "um": "Pç", "loc": "F-02-04-01", "qtd": "648"}, {"item": "143104", "desc": "FITA DE VEDACAO TACKY TAPE (13,71M X 9,5MM)", "um": "M", "loc": "F-03-01-01", "qtd": "8163,62"}, {"item": "143105", "desc": "FITA DE VEDACAO TACKY TAPE (12,2M X 22,2MM)", "um": "M", "loc": "F-03-01-02", "qtd": "85,4"}, {"item": "149750", "desc": "FITA LATERAL INOVACEL BRANCA COM LOGO LAD DIREITO 50MM", "um": "M", "loc": "F-03-02-01", "qtd": "10000"}, {"item": "143043", "desc": "ACAB TRAPEZOIDAL C/P TP-40 PIR 3TP 70MM-RAL9003 0,43", "um": "M", "loc": "F-03-02-02", "qtd": "310"}, {"item": "149751", "desc": "FITA LATERAL INOVACEL BRANCA COM LOGO LAD ESQUERDO 50MM", "um": "M", "loc": "F-03-02-02", "qtd": "10000"}, {"item": "930079", "desc": "V302939 - ARRUELA FIXAÇÃO MEMBRANA TPO HPVX 2 3/8\"", "um": "Pç", "loc": "F-03-02-03", "qtd": "670"}, {"item": "147102", "desc": "FITA EVA 1 FACE ADESIVA 2MM X 20MM X 10M", "um": "RL", "loc": "F-03-03-01", "qtd": "337"}, {"item": "132245", "desc": "TAMPA PLÁSTICA AIRBRISE 70MM X 175MM PRETA", "um": "Pç", "loc": "F-03-04-02", "qtd": "70"}, {"item": "140364", "desc": "FITA LATERAL 50MM - ESQUERDA", "um": "M", "loc": "F-03-05-01", "qtd": "216000"}, {"item": "140366", "desc": "FITA LATERAL 65MM - DIREITA", "um": "M", "loc": "F-03-05-02", "qtd": "120000"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "G-01-01-01", "qtd": "648"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "G-01-01-02", "qtd": "648"}, {"item": "140509", "desc": "ASFALTO SOLUÇAO", "um": "L", "loc": "G-01-02-01", "qtd": "648"}, {"item": "140509", "desc": "ASFALTO SOLUÇAO", "um": "L", "loc": "G-01-02-02", "qtd": "648"}, {"item": "140509", "desc": "ASFALTO SOLUÇAO", "um": "L", "loc": "G-01-03-01", "qtd": "180"}, {"item": "149752", "desc": "FITA LATERAL INOVACEL BRANCA COM LOGO LAD DIREITO 70MM", "um": "M", "loc": "G-01-03-02", "qtd": "10000"}, {"item": "149753", "desc": "FITA LATERAL INOVACEL BRANCA COM LOGO LAD ESQUERDO 70MM", "um": "M", "loc": "G-01-03-02", "qtd": "10000"}, {"item": "149754", "desc": "FITA LATERAL INOVACEL BRANCA COM LOGO LAD DIREITO 100MM", "um": "M", "loc": "G-01-03-02", "qtd": "10000"}, {"item": "149755", "desc": "FITA LATERAL INOVACEL BRANCA COM LOGO LAD ESQUERDO 100MM", "um": "M", "loc": "G-01-03-02", "qtd": "10000"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "G-01-04-01", "qtd": "648"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "G-01-04-02", "qtd": "648"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "G-02-01-01", "qtd": "648"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "G-02-01-02", "qtd": "648"}, {"item": "141662", "desc": "MASSA VEDANTE ( SL ) (BRANCO) - 280ML", "um": "Pç", "loc": "G-02-02-01", "qtd": "925"}, {"item": "141668", "desc": "MASSA VEDANTE PAINEIS (CINZA) 600ML", "um": "Pç", "loc": "G-02-02-02", "qtd": "597"}, {"item": "124723", "desc": "ADESIVO P/ PAINEL CURVO PU55 20 PRETO 405G/310ML", "um": "UN", "loc": "G-02-03-01", "qtd": "600"}, {"item": "141686", "desc": "MASSA VEDANTE PAINEIS (BRANCO) - 600ML", "um": "PÇ", "loc": "G-02-03-01", "qtd": "1008"}, {"item": "930352", "desc": "COLA CASCOLA (16,3 LT)", "um": "Pç", "loc": "G-02-03-01", "qtd": "4"}, {"item": "144059", "desc": "MASSA VEDANTE TELHAS (BRANCO) - 600ML", "um": "Pç", "loc": "G-02-03-02", "qtd": "1008"}, {"item": "931099", "desc": "LIMPADOR DE TPO PARA SOLDA UNA 256 (14,6KG)", "um": "Pç", "loc": "G-02-03-02", "qtd": "4"}, {"item": "141681", "desc": "MASSA VEDANTE ( SL ) (CINZA)", "um": "Pç", "loc": "G-03-01-02", "qtd": "575"}, {"item": "800073", "desc": "COLA HOT MELT GRANULADA", "um": "Kg", "loc": "G-03-01-02", "qtd": "400"}, {"item": "141671", "desc": "MASSA VEDANTE ( SL ) (PRETO)", "um": "Pç", "loc": "G-03-02-01", "qtd": "262"}, {"item": "144062", "desc": "MASSA VEDANTE TELHAS (RAL8023)", "um": "Pç", "loc": "G-03-02-02", "qtd": "10"}, {"item": "144068", "desc": "SILICONE P/ TELHAS (INCOLOR)", "um": "Pç", "loc": "G-03-02-03", "qtd": "86"}, {"item": "124723", "desc": "ADESIVO P/ PAINEL CURVO PU55 20 PRETO 405G/310ML", "um": "UN", "loc": "G-03-02-04", "qtd": "400"}, {"item": "132592", "desc": "LUBRIFICANTE INDUSTRIAL QUIMATIC 10", "um": "Pç", "loc": "G-03-02-05", "qtd": "24"}, {"item": "141708", "desc": "MASSA VEDANTE CINZA SIKAFLEX 221 (400 ML)", "um": "Pç", "loc": "G-03-03-01", "qtd": "126"}, {"item": "141707", "desc": "MASSA VEDANTE BRANCA SIKAFLEX 221 (400 ML)", "um": "Pç", "loc": "G-03-03-02", "qtd": "443"}, {"item": "143105", "desc": "FITA DE VEDACAO TACKY TAPE (12,2M X 22,2MM)", "um": "M", "loc": "G-03-04-01", "qtd": "4550,6"}, {"item": "140381", "desc": "FITA MULTIUSO ALUMINIZADA SIKA 20CM X 10M", "um": "RL", "loc": "G-03-04-02", "qtd": "147"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "H-01", "qtd": "648"}, {"item": "140509", "desc": "ASFALTO SOLUÇAO", "um": "L", "loc": "H-02", "qtd": "450"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "H-03", "qtd": "648"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "H-04", "qtd": "648"}, {"item": "712617", "desc": "ESTOPA DE PANO (RETALHO)", "um": "Kg", "loc": "H-07", "qtd": "180"}, {"item": "140558", "desc": "IMPERMEABILIZANTE PRETO - 18 KG", "um": "Kg", "loc": "H-08", "qtd": "612"}, {"item": "141872", "desc": "FILME PROT. POLI. AMADEIRADO SEM UV LARG. 1150 X 0,030MM", "um": "KG", "loc": "H-09", "qtd": "662,9"}, {"item": "141872", "desc": "FILME PROT. POLI. AMADEIRADO SEM UV LARG. 1150 X 0,030MM", "um": "KG", "loc": "H-10", "qtd": "673,3"}, {"item": "141872", "desc": "FILME PROT. POLI. AMADEIRADO SEM UV LARG. 1150 X 0,030MM", "um": "KG", "loc": "H-11", "qtd": "671,7"}, {"item": "141872", "desc": "FILME PROT. POLI. AMADEIRADO SEM UV LARG. 1150 X 0,030MM", "um": "KG", "loc": "H-12", "qtd": "654,7"}, {"item": "700027", "desc": "SACO PEAD TRANSP LISO 12+124+12 X 160 X 0,03", "um": "UN", "loc": "H-13", "qtd": "7250"}, {"item": "700027", "desc": "SACO PEAD TRANSP LISO 12+124+12 X 160 X 0,03", "um": "UN", "loc": "H-14", "qtd": "7500"}, {"item": "931110", "desc": "COLA DE CONTATO PARA TPO UNIFLEX 2050 (14KG)", "um": "BD", "loc": "H-31", "qtd": "29"}, {"item": "712617", "desc": "ESTOPA DE PANO (RETALHO)", "um": "Kg", "loc": "H-32", "qtd": "240"}, {"item": "143104", "desc": "FITA DE VEDACAO TACKY TAPE (13,71M X 9,5MM)", "um": "M", "loc": "I-01-01-01", "qtd": "8774,4"}, {"item": "144060", "desc": "MASSA VEDANTE TELHAS (CINZA) - 600ML", "um": "Pç", "loc": "I-01-01-02", "qtd": "1008"}, {"item": "143105", "desc": "FITA DE VEDACAO TACKY TAPE (12,2M X 22,2MM)", "um": "M", "loc": "I-01-02-02", "qtd": "2440"}, {"item": "600010", "desc": "FILME STRETCH 100 X 0,025MM - ROLO COM 3KG", "um": "Kg", "loc": "I-01-02-02", "qtd": "504"}, {"item": "600010", "desc": "FILME STRETCH 100 X 0,025MM - ROLO COM 3KG", "um": "Kg", "loc": "I-01-03-01", "qtd": "280"}, {"item": "600010", "desc": "FILME STRETCH 100 X 0,025MM - ROLO COM 3KG", "um": "Kg", "loc": "I-01-03-02", "qtd": "492"}, {"item": "600016", "desc": "CALÇO EPE / SKIN 60 BR 260 X 150 X 40 MM", "um": "Pç", "loc": "I-01-04-01", "qtd": "864"}, {"item": "600016", "desc": "CALÇO EPE / SKIN 60 BR 260 X 150 X 40 MM", "um": "Pç", "loc": "I-01-04-02", "qtd": "864"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-02-01-01", "qtd": "580"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-02-01-02", "qtd": "580"}, {"item": "600010", "desc": "FILME STRETCH 100 X 0,025MM - ROLO COM 3KG", "um": "Kg", "loc": "I-02-02-01", "qtd": "504"}, {"item": "600010", "desc": "FILME STRETCH 100 X 0,025MM - ROLO COM 3KG", "um": "Kg", "loc": "I-02-02-02", "qtd": "504"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-02-03-01", "qtd": "652"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-02-03-02", "qtd": "652"}, {"item": "600016", "desc": "CALÇO EPE / SKIN 60 BR 260 X 150 X 40 MM", "um": "Pç", "loc": "I-02-04-01", "qtd": "864"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-03-01-01", "qtd": "652"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-03-01-02", "qtd": "611"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-03-02-01", "qtd": "652"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-03-02-02", "qtd": "652"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-03-03-01", "qtd": "652"}, {"item": "600007", "desc": "FILME STRETCH 500 X 0,025MM - ROLO COM 18KG", "um": "Kg", "loc": "I-03-03-02", "qtd": "652"}, {"item": "804388", "desc": "REMOVEDOR P/ LIMPEZA 1000ML", "um": "UN", "loc": "INFLAMAVEL H-20", "qtd": "581"}, {"item": "712297", "desc": "ALCOOL HIDRATADO 96º 1L", "um": "Pç", "loc": "INFLAMAVEL H-21", "qtd": "338"}, {"item": "141308", "desc": "TINTA SPRAY 300ML RAL6037", "um": "Pç", "loc": "INFLAMAVEL H-22", "qtd": "14"}, {"item": "141646", "desc": "SELANTE INTUMESCENTE FM APPROVALS (300ml)", "um": "PÇ", "loc": "INFLAMAVEL H-23", "qtd": "198"}, {"item": "142657", "desc": "ADESIVO SPRAY", "um": "Pç", "loc": "INFLAMAVEL H-24", "qtd": "13"}, {"item": "712230", "desc": "LOCTITE 495 100GRS", "um": "Pç", "loc": "INFLAMAVEL H-25", "qtd": "237"}, {"item": "141287", "desc": "TINTA SPRAY ISOCOLOR 350ML BRANCO RAL9003", "um": "Pç", "loc": "INFLAMAVEL H-26", "qtd": "30"}, {"item": "132692", "desc": "TINTA SPRAY ISOCOLOR 350ML ALUMINIO RAL9005", "um": "Pç", "loc": "INFLAMAVEL H-27", "qtd": "36"}, {"item": "140001", "desc": "DILUENTE P/ RETOQUE GALÃO 4,5 LITROS", "um": "Pç", "loc": "INFLAMAVEL H-28", "qtd": "1"}, {"item": "141186", "desc": "DESMOLDANTE FAINATEX BASE OLEO MINERAL (ECOPIR)", "um": "KG", "loc": "INFLAMAVEL H-29", "qtd": "211,2"}, {"item": "141185", "desc": "DESMOLDANTE FAINATEX BASE OLEO MINERAL (ROBOR)", "um": "KG", "loc": "INFLAMAVEL H-30", "qtd": "264"}, {"item": "141686", "desc": "MASSA VEDANTE PAINEIS (BRANCO) - 600ML", "um": "PÇ", "loc": "J-01-01-01", "qtd": "823"}, {"item": "144059", "desc": "MASSA VEDANTE TELHAS (BRANCO) - 600ML", "um": "Pç", "loc": "J-01-01-02", "qtd": "439"}, {"item": "141686", "desc": "MASSA VEDANTE PAINEIS (BRANCO) - 600ML", "um": "PÇ", "loc": "J-01-02-01", "qtd": "1008"}, {"item": "141686", "desc": "MASSA VEDANTE PAINEIS (BRANCO) - 600ML", "um": "PÇ", "loc": "J-01-02-02", "qtd": "1008"}, {"item": "142845", "desc": "GANCHO GALVANIZADO 5/16 X 500MM", "um": "Pç", "loc": "J-01-03-01", "qtd": "2030"}, {"item": "132117", "desc": "RÉGUA DE POLICARBONATO", "um": "UN", "loc": "J-02-01-02", "qtd": "9000"}, {"item": "800042", "desc": "PAPEL MANILHA MARROM 1200MM", "um": "Pç", "loc": "J-02-01-02", "qtd": "24"}, {"item": "141686", "desc": "MASSA VEDANTE PAINEIS (BRANCO) - 600ML", "um": "PÇ", "loc": "J-02-02-01", "qtd": "1008"}, {"item": "141686", "desc": "MASSA VEDANTE PAINEIS (BRANCO) - 600ML", "um": "PÇ", "loc": "J-02-02-02", "qtd": "1008"}, {"item": "144060", "desc": "MASSA VEDANTE TELHAS (CINZA) - 600ML", "um": "Pç", "loc": "J-03-01-01", "qtd": "199"}, {"item": "133121", "desc": "FILME PROTETIVO DE POLIETILENO LARG. 1150MM - VERMELHO", "um": "KG", "loc": "J-03-02-01", "qtd": "496"}, {"item": "133121", "desc": "FILME PROTETIVO DE POLIETILENO LARG. 1150MM - VERMELHO", "um": "KG", "loc": "J-03-02-02", "qtd": "378,4"}, {"item": "131197", "desc": "FITA DUPLA FACE VHB 4910 9.5MM X 1,0MM X 10M", "um": "RL", "loc": "J-03-03-01", "qtd": "1500"}, {"item": "930076", "desc": "V302937 - ARRUELA FIXAÇÃO PIR 3\"", "um": "Pç", "loc": "J-03-03-02", "qtd": "14270"}, {"item": "712617", "desc": "ESTOPA DE PANO (RETALHO)", "um": "Kg", "loc": "J-03-04-01", "qtd": "240"}, {"item": "134480", "desc": "SUPORTE L 200 X 117 X 2,70MM GALV. - RAL9003 (3 METROS)", "um": "PÇ", "loc": "OBRAS HAVAN", "qtd": "64"}, {"item": "140610", "desc": "CANTONEIRA 50 X 50 X 4,75MM - RAL5003 (L= 80MM)", "um": "Pç", "loc": "OBRAS HAVAN", "qtd": "880"}, {"item": "142691", "desc": "PERFIL U 50 X 111 X 50 X 2,70MM - RAL9003 (3 METROS)", "um": "Pç", "loc": "OBRAS HAVAN", "qtd": "159"}, {"item": "142696", "desc": "PERFIL U 50 X 61 X 50 X 2,70MM - RAL9003 (3 METROS)", "um": "PÇ", "loc": "OBRAS HAVAN", "qtd": "20"}, {"item": "147286", "desc": "PERFIL U 50 X 111 X 50 X 2,70MM - RAL9003 - EXT (3 METROS)", "um": "PÇ", "loc": "OBRAS HAVAN", "qtd": "246"}, {"item": "138316", "desc": "VISOR SALA LIMPA 1000 X 1000 X 50MM - S/LOGO - BORDA BRANCA", "um": "Pç", "loc": "REC", "qtd": "1"}, {"item": "140958", "desc": "JAQUETA S/ CAPUS - TAMANHO P", "um": "Pç", "loc": "REC", "qtd": "19"}, {"item": "140959", "desc": "JAQUETA S/ CAPUS - TAMANHO G", "um": "Pç", "loc": "REC", "qtd": "20"}, {"item": "141282", "desc": "TINTA P/RETOQUE RAL9003 /GALAO 3,6 L", "um": "Pç", "loc": "REC", "qtd": "5"}, {"item": "600844", "desc": "PLASTICO BOLHA 1.30 x 100 m", "um": "Pç", "loc": "REC", "qtd": "2"}, {"item": "714501", "desc": "JAQUETA C/ CAPUZ - M", "um": "Pç", "loc": "REC", "qtd": "18"}, {"item": "800056", "desc": "TRENA MANUAL AÇO (10 METROS) - STARRET", "um": "Pç", "loc": "REC", "qtd": "30"}, {"item": "800056", "desc": "TRENA MANUAL AÇO (10 METROS) - STARRET", "um": "Pç", "loc": "SALA DE CALIBRAÇÃO", "qtd": "20"}, {"item": "712620", "desc": "CAIXA P/ ARQUIVO MORTO", "um": "UN", "loc": "rec", "qtd": "150"}, {"item": "714501", "desc": "JAQUETA C/ CAPUZ - M", "um": "Pç", "loc": "REC", "qtd": "18"}, {"item": "800056", "desc": "TRENA MANUAL AÇO (10 METROS) - STARRET", "um": "Pç", "loc": "SALA DE CALIBRAÇÃO", "qtd": "20"}];

let currentData = [];
let modoContagemAtivo = false;
let nomeUsuarioAtual = '';
let fichaImageMap = new Map();
let fichaBoxMap = new Map();
let sortKey = null;
let sortDir = 1;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function parseQtd(v) {
  if (typeof v !== 'string') return v;
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
}

// Como o mesmo código de item pode aparecer em mais de um endereço, a contagem
// física é guardada por combinação de item + localização, não só pelo item.
function chaveContagem(item, localizacao) {
  return item + '::' + localizacao;
}

function formatarDiferenca(fisico, sistema) {
  const diff = parseQtd(fisico) - parseQtd(sistema);
  if (diff === 0) return `<span class="diff-badge diff-ok">✓ OK</span>`;
  const sinal = diff > 0 ? '+' : '';
  const classe = diff > 0 ? 'diff-mais' : 'diff-menos';
  return `<span class="diff-badge ${classe}">${sinal}${diff.toLocaleString('pt-BR')}</span>`;
}

function render(rows, intervalo) {
  const tbody = document.getElementById('tableBody');
  const emptyMsg = document.getElementById('emptyMsg');
  document.getElementById('loadingMsg').style.display = 'none';
  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  let letraAnterior = null;
  tbody.innerHTML = rows.map((r, i) => {
    let quebra = '';
    if (intervalo) {
      const letraAtual = extrairLetraGrupo(r.localizacao, intervalo.tipo);
      if (i > 0 && letraAtual && letraAtual !== letraAnterior) quebra = ' class="quebra-pagina"';
      letraAnterior = letraAtual;
    }
    return `
    <tr${quebra}>
      <td class="item">${escapeHtml(r.item)}</td>
      <td>${escapeHtml(r.descricao)}</td>
      <td>${escapeHtml(r.um)}</td>
      <td class="loc">${escapeHtml(r.localizacao)}</td>
      <td class="col-padrao" style="text-align:center;">${fichaBoxMap.has(r.item) ? `<button class="padrao-btn" data-item="${escapeHtml(r.item)}" data-qtd="${escapeHtml(r.quantidade)}" title="Ver padrão de caixas esperado">📦</button>` : ''}</td>
      <td class="num">${escapeHtml(r.quantidade)}</td>
      <td class="col-ficha" style="text-align:center;">${fichaImageMap.has(r.item) ? `<button class="ficha-btn" data-item="${escapeHtml(r.item)}" title="Ver imagem e ficha técnica">🖼️</button>${fichaImageMap.get(r.item) ? `<img class="print-only-thumb" src="${escapeHtml(fichaImageMap.get(r.item))}" alt="">` : ''}` : ''}</td>
      <td class="col-unidades" style="text-align:center;"><button class="compare-btn" data-item="${escapeHtml(r.item)}" title="Comparar entre unidades">⇄</button></td>
      <td class="col-contagem" style="display:${modoContagemAtivo ? 'table-cell' : 'none'};">
        <input type="text" inputmode="decimal" class="contagem-input" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}"
               value="${contagemMap[chaveContagem(r.item, r.localizacao)] ? escapeHtml(contagemMap[chaveContagem(r.item, r.localizacao)]) : ''}"
               placeholder="—">
        <div class="contagem-rodape">
          <span class="diff-slot" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}">${contagemMap[chaveContagem(r.item, r.localizacao)] ? formatarDiferenca(contagemMap[chaveContagem(r.item, r.localizacao)], r.quantidade) : ''}</span>
          <button class="contagem-clear-btn" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}" type="button" style="display:${contagemMap[chaveContagem(r.item, r.localizacao)] ? 'inline-block' : 'none'};">Limpar</button>
        </div>
        <div class="caixas-slot" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}">${contagemMap[chaveContagem(r.item, r.localizacao)] ? formatarCaixas(contagemMap[chaveContagem(r.item, r.localizacao)], r.item) : ''}</div>
      </td>
    </tr>
  `;
  }).join('');
}

let filtros = { localizacao: '', um: '', zerado: false, comFoto: false, divergente: false };

function tentarIntervaloCorredor(q) {
  // Formato 1: "corredor a", "corredor a-b", "corredor a até b" -> locais tipo A-01-01-01
  let m = q.match(/^corredor\s*([a-z])(?:\s*(?:-|até|ate)\s*([a-z]))?$/i);
  if (m) {
    const de = m[1].toUpperCase();
    const ate = m[2] ? m[2].toUpperCase() : de;
    const [inicio, fim] = de <= ate ? [de, ate] : [ate, de];
    return { tipo: 'corredor', inicio, fim };
  }
  // Formato 2: "cant a", "cant a-g", "cant a até g" -> locais tipo CANT A, CANT B...
  m = q.match(/^cant\s*([a-z])(?:\s*(?:-|até|ate)\s*([a-z]))?$/i);
  if (m) {
    const de = m[1].toUpperCase();
    const ate = m[2] ? m[2].toUpperCase() : de;
    const [inicio, fim] = de <= ate ? [de, ate] : [ate, de];
    return { tipo: 'cant', inicio, fim };
  }
  return null;
}

function extrairLetraGrupo(localizacao, tipo) {
  const loc = String(localizacao).trim().toUpperCase();
  if (tipo === 'cant') {
    const m = loc.match(/^CANT\s+([A-Z])\b/);
    return m ? m[1] : null;
  }
  // padrão "corredor": letra única seguida de traço (ex: A-01-...)
  const m = loc.match(/^([A-Z])-/);
  return m ? m[1] : null;
}

function applyFilterAndSort() {
  const qOriginal = document.getElementById('searchBox').value.trim();
  const q = qOriginal.toLowerCase();
  let rows = currentData;

  const intervalo = tentarIntervaloCorredor(qOriginal);
  if (intervalo) {
    rows = rows.filter(r => {
      const letra = extrairLetraGrupo(r.localizacao, intervalo.tipo);
      if (!letra) return false;
      return letra >= intervalo.inicio && letra <= intervalo.fim;
    });
  } else if (q) {
    rows = rows.filter(r =>
      String(r.item).toLowerCase().includes(q) ||
      String(r.descricao).toLowerCase().includes(q) ||
      String(r.localizacao).toLowerCase().includes(q) ||
      String(r.um).toLowerCase().includes(q)
    );
  }
  if (filtros.localizacao) {
    const alvo = filtros.localizacao.toLowerCase();
    rows = rows.filter(r => String(r.localizacao).toLowerCase().includes(alvo));
  }
  if (filtros.um) rows = rows.filter(r => r.um === filtros.um);
  if (filtros.zerado) rows = rows.filter(r => parseQtd(r.quantidade) === 0);
  if (filtros.comFoto) rows = rows.filter(r => fichaImageMap.has(r.item));
  if (filtros.divergente) {
    rows = rows.filter(r => {
      const fisico = contagemMap[chaveContagem(r.item, r.localizacao)];
      if (fisico === undefined || fisico === '') return false;
      return parseQtd(fisico) !== parseQtd(r.quantidade);
    });
  }

  if (sortKey) {
    const keyMap = { item: 'item', desc: 'descricao', um: 'um', loc: 'localizacao', qtd: 'quantidade' };
    const realKey = keyMap[sortKey];
    rows = [...rows].sort((a, b) => {
      let va = a[realKey], vb = b[realKey];
      if (sortKey === 'qtd') { va = parseQtd(va); vb = parseQtd(vb); }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
  } else if (intervalo) {
    // Sem ordenação manual escolhida: agrupa por localização, pra impressão sair separada por corredor
    rows = [...rows].sort((a, b) => String(a.localizacao).localeCompare(String(b.localizacao)));
  }
  render(rows, intervalo);
}

function popularFiltrosDropdown() {
  const locInput = document.getElementById('filterLocalizacao');
  const locDatalist = document.getElementById('localizacoesDatalist');
  const umSelect = document.getElementById('filterUm');
  const locsUnicas = [...new Set(currentData.map(r => r.localizacao).filter(Boolean))].sort();
  const umsUnicas = [...new Set(currentData.map(r => r.um).filter(Boolean))].sort();

  locDatalist.innerHTML = locsUnicas.map(l => `<option value="${escapeHtml(l)}">`).join('');
  locInput.value = filtros.localizacao;
  umSelect.innerHTML = '<option value="">Todas</option>' +
    umsUnicas.map(u => `<option value="${escapeHtml(u)}" ${filtros.um === u ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');
}

function atualizarBadgeFiltros() {
  const ativos = [filtros.localizacao, filtros.um, filtros.zerado, filtros.comFoto, filtros.divergente].filter(Boolean).length;
  const badge = document.getElementById('filterCount');
  if (ativos > 0) {
    badge.textContent = ativos;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function updateStats() {
  document.getElementById('stat-count').textContent = currentData.length;
  let latest = null;
  let latestPor = null;
  for (const r of currentData) {
    if (r.atualizado_em && (!latest || r.atualizado_em > latest)) {
      latest = r.atualizado_em;
      latestPor = r.atualizado_por;
    }
  }
  document.getElementById('stat-updated').textContent = latest
    ? new Date(latest).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '-';
  document.getElementById('stat-updated-by').textContent = latestPor || '-';
}

async function loadFichaImageMap() {
  try {
    const { data, error } = await sb.from('fichas_tecnicas').select('item, imagem_url, qtd_caixa_master, qtd_caixa_fracionada');
    if (error) throw error;
    fichaImageMap = new Map((data || []).map(r => [r.item, r.imagem_url]));
    fichaBoxMap = new Map((data || [])
      .filter(r => r.qtd_caixa_master)
      .map(r => [r.item, { master: r.qtd_caixa_master, fracionada: r.qtd_caixa_fracionada }]));
  } catch (e) {
    console.warn('Não foi possível carregar a lista de fichas técnicas:', e.message);
    fichaImageMap = new Map();
    fichaBoxMap = new Map();
  }
}

// Calcula quantas caixas master fechadas, caixas fracionadas fechadas, e peças soltas
// cabem num total de peças, com base no tamanho de cada tipo de caixa.
function calcularCaixas(totalPecas, info) {
  if (!info || !info.master) return null;
  let restante = Math.round(parseQtd(String(totalPecas)));
  const caixasMaster = Math.floor(restante / info.master);
  restante -= caixasMaster * info.master;
  let caixasFracionadas = 0;
  if (info.fracionada) {
    caixasFracionadas = Math.floor(restante / info.fracionada);
    restante -= caixasFracionadas * info.fracionada;
  }
  return { caixasMaster, caixasFracionadas, pecasSoltas: restante };
}

function formatarCaixas(totalPecas, itemCode) {
  const info = fichaBoxMap.get(itemCode);
  const resultado = calcularCaixas(totalPecas, info);
  if (!resultado) return '';
  const partes = [];
  if (resultado.caixasMaster > 0) partes.push(`${resultado.caixasMaster} cx master`);
  if (resultado.caixasFracionadas > 0) partes.push(`${resultado.caixasFracionadas} cx fracionada`);
  if (resultado.pecasSoltas > 0) partes.push(`${resultado.pecasSoltas} pçs soltas`);
  return partes.length ? `= ${partes.join(' + ')}` : '';
}

const UNIDADES = {
  '106': { cidade: 'Araquari', uf: 'SC' },
  '101': { cidade: 'Anápolis', uf: 'GO' },
  '105': { cidade: 'Cambuí', uf: 'MG' }
};
let unidadeAtual = '106';

function atualizarSubtituloUnidade() {
  // O subtitulo saiu do layout na Fase 2b; a unidade agora fica no cabecalho.
  // Mantido tolerante a ausencia para nao quebrar quem ainda o tenha.
  if (!document.getElementById('unitSubtitle')) return;
  const u = UNIDADES[unidadeAtual];
  document.getElementById('unitSubtitle').textContent =
    `Unidade ${unidadeAtual}, em ${u.cidade} (${u.uf}). Consulta de itens, quantidades e localizações do almoxarifado.`;
}

async function loadData() {
  const { data, error } = await sb.from('estoque').select('*').eq('unidade', unidadeAtual).order('id', { ascending: true });
  if (error) {
    document.getElementById('loadingMsg').textContent = 'Erro ao carregar dados: ' + error.message;
    return;
  }
  if ((!data || data.length === 0) && unidadeAtual === '106') {
    // Tabela vazia na unidade principal: popular com os dados iniciais (só acontece na primeiríssima vez)
    await seedInitialData();
    return loadData();
  }
  currentData = data || [];
  await loadFichaImageMap();
  updateStats();
  applyFilterAndSort();
}

async function seedInitialData() {
  const rows = SEED_DATA.map(r => ({
    item: r.item, descricao: r.desc, um: r.um, localizacao: r.loc, quantidade: r.qtd
  }));
  await sb.from('estoque').insert(rows);
}

function parsePastedTsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const records = [];
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 5) continue;
    const [item, desc, um, loc, qtd] = cols;
    if (item.toLowerCase() === 'item' && desc.toLowerCase().startsWith('descri')) continue;
    records.push({ item: item.trim(), descricao: desc.trim(), um: um.trim(), localizacao: loc.trim(), quantidade: qtd.trim() });
  }
  return records;
}

// ---- Modal de Ficha Técnica ----
const fichaModal = document.getElementById('fichaModal');
const fichaModalBox = document.getElementById('fichaModalBox');

function closeFichaModal() {
  fichaModal.classList.remove('open');
}

function podeEditarEmbalagem() {
  return isAdminAtual || emailUsuarioAtual === 'j.lisboa@kingspanisoeste.com.br';
}

function campoEmbalagem(data, itemCode) {
  if (!podeEditarEmbalagem()) {
    return data.qtd_caixa_master
      ? `<div class="modal-label">Embalagem</div><div class="modal-text">Caixa master: ${escapeHtml(data.qtd_caixa_master)} pçs${data.qtd_caixa_fracionada ? ` · Caixa fracionada: ${escapeHtml(data.qtd_caixa_fracionada)} pçs` : ''}</div>`
      : '';
  }
  return `
    <div class="modal-label">Embalagem (editável)</div>
    <div style="display:flex; gap:8px; margin-top:4px;">
      <div style="flex:1;">
        <label style="font-size:11px; color:var(--muted);">Caixa master (pçs)</label>
        <input type="text" inputmode="numeric" class="embalagem-input" data-item="${escapeHtml(itemCode)}" data-campo="qtd_caixa_master"
               value="${data.qtd_caixa_master || ''}" placeholder="Ex: 2000"
               style="width:100%; padding:7px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
      </div>
      <div style="flex:1;">
        <label style="font-size:11px; color:var(--muted);">Caixa fracionada (pçs)</label>
        <input type="text" inputmode="numeric" class="embalagem-input" data-item="${escapeHtml(itemCode)}" data-campo="qtd_caixa_fracionada"
               value="${data.qtd_caixa_fracionada || ''}" placeholder="Ex: 200"
               style="width:100%; padding:7px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
      </div>
    </div>
    <div class="status-msg" id="embalagemMsg" style="margin-top:4px;"></div>
  `;
}

async function salvarEmbalagem(input) {
  const itemCode = input.dataset.item;
  const campo = input.dataset.campo;
  const valor = input.value.trim() === '' ? null : input.value.trim();
  const msg = document.getElementById('embalagemMsg');
  try {
    const { error } = await sb.from('fichas_tecnicas')
      .update({ [campo]: valor })
      .eq('item', itemCode);
    if (error) throw error;
    if (msg) { msg.textContent = 'Salvo!'; msg.className = 'status-msg status-ok'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
    if (fichaBoxMap.has(itemCode) || valor) {
      const atual = fichaBoxMap.get(itemCode) || { master: null, fracionada: null };
      if (campo === 'qtd_caixa_master') atual.master = valor ? parseFloat(valor) : null;
      if (campo === 'qtd_caixa_fracionada') atual.fracionada = valor ? parseFloat(valor) : null;
      fichaBoxMap.set(itemCode, atual);
    }
  } catch (err) {
    if (msg) { msg.textContent = 'Erro: ' + err.message; msg.className = 'status-msg status-err'; }
  }
}

async function openFichaModal(itemCode) {
  fichaModalBox.innerHTML = `
    <button class="modal-close" id="fichaCloseBtn">✕</button>
    <div class="modal-empty">Carregando...</div>
  `;
  fichaModal.classList.add('open');
  document.getElementById('fichaCloseBtn').addEventListener('click', closeFichaModal);

  const { data, error } = await sb.from('fichas_tecnicas').select('*').eq('item', itemCode).maybeSingle();

  if (error || !data) {
    fichaModalBox.innerHTML = `
      <button class="modal-close" id="fichaCloseBtn2">✕</button>
      <h3>Item ${escapeHtml(itemCode)}</h3>
      <div class="modal-empty">Ainda não há imagem ou ficha técnica cadastrada para este item.</div>
      ${podeEditarEmbalagem() ? campoEmbalagem({}, itemCode) : ''}
    `;
    document.getElementById('fichaCloseBtn2').addEventListener('click', closeFichaModal);
    if (podeEditarEmbalagem()) {
      fichaModalBox.querySelectorAll('.embalagem-input').forEach(inp => {
        inp.addEventListener('change', async () => {
          // Ainda não existe linha na ficha pra esse item - cria uma antes de salvar
          await sb.from('fichas_tecnicas').upsert({ item: itemCode }, { onConflict: 'item' });
          await salvarEmbalagem(inp);
        });
      });
    }
    return;
  }

  fichaModalBox.innerHTML = `
    <button class="modal-close" id="fichaCloseBtn3">✕</button>
    ${data.imagem_url ? `<img src="${escapeHtml(data.imagem_url)}" alt="${escapeHtml(data.descricao || itemCode)}">` : ''}
    <h3>${escapeHtml(data.descricao || itemCode)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(itemCode)}</div>
    ${data.uso ? `<div class="modal-label">Uso recomendado</div><div class="modal-text">${escapeHtml(data.uso)}</div>` : ''}
    ${campoEmbalagem(data, itemCode)}
  `;
  document.getElementById('fichaCloseBtn3').addEventListener('click', closeFichaModal);
  fichaModalBox.querySelectorAll('.embalagem-input').forEach(inp => {
    inp.addEventListener('change', () => salvarEmbalagem(inp));
  });
}

document.getElementById('tableBody').addEventListener('click', (e) => {
  const fichaBtn = e.target.closest('.ficha-btn');
  if (fichaBtn) { openFichaModal(fichaBtn.dataset.item); return; }
  const compareBtn = e.target.closest('.compare-btn');
  if (compareBtn) { openCompareModal(compareBtn.dataset.item); return; }
  const padraoBtn = e.target.closest('.padrao-btn');
  if (padraoBtn) { mostrarPadraoCaixas(padraoBtn); return; }
});

const padraoModal = document.getElementById('padraoModal');
function mostrarPadraoCaixas(btn) {
  const texto = formatarCaixas(btn.dataset.qtd, btn.dataset.item) || 'Sem padrão de caixa suficiente pra calcular.';
  const info = fichaBoxMap.get(btn.dataset.item);
  document.getElementById('padraoCodigo').textContent = 'Item ' + btn.dataset.item;
  document.getElementById('padraoTexto').textContent = texto.replace(/^= /, '');
  document.getElementById('padraoReferencia').textContent = info
    ? `Caixa master: ${info.master} pçs${info.fracionada ? ` · Caixa fracionada: ${info.fracionada} pçs` : ''}`
    : '';
  padraoModal.classList.add('open');
}
document.getElementById('padraoCloseBtn').addEventListener('click', () => padraoModal.classList.remove('open'));
padraoModal.addEventListener('click', (e) => { if (e.target === padraoModal) padraoModal.classList.remove('open'); });

async function salvarContagemItem(input) {
  const itemCode = input.dataset.item;
  const loc = input.dataset.loc;
  const chave = chaveContagem(itemCode, loc);
  const valor = input.value.trim();
  const celula = input.closest('td');
  const diffSlot = celula.querySelector('.diff-slot');
  const clearBtn = celula.querySelector('.contagem-clear-btn');
  const caixasSlot = celula.querySelector('.caixas-slot');
  input.classList.remove('contagem-salvo', 'contagem-divergente');
  if (valor === '') {
    if (diffSlot) diffSlot.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (caixasSlot) caixasSlot.innerHTML = '';
    delete contagemMap[chave];
    try {
      await sb.from('contagem_fisica').delete().eq('item', itemCode).eq('unidade', unidadeAtual).eq('localizacao', loc);
    } catch (err) {
      console.warn('Erro ao limpar contagem:', err.message);
    }
    return;
  }
  try {
    await sb.from('contagem_fisica').upsert({
      item: itemCode, unidade: unidadeAtual, localizacao: loc, quantidade_fisica: valor,
      contado_por: nomeUsuarioAtual,
      contado_em: new Date().toISOString()
    }, { onConflict: 'item,unidade,localizacao' });
    contagemMap[chave] = valor;
    if (clearBtn) clearBtn.style.display = 'inline-block';
    if (caixasSlot) caixasSlot.innerHTML = formatarCaixas(valor, itemCode);
    // Compara com a quantidade do sistema (dessa linha específica) e mostra o resultado da conta
    const linha = currentData.find(r => r.item === itemCode && r.localizacao === loc);
    if (linha) {
      if (diffSlot) diffSlot.innerHTML = formatarDiferenca(valor, linha.quantidade);
      input.classList.add(parseQtd(valor) === parseQtd(linha.quantidade) ? 'contagem-salvo' : 'contagem-divergente');
    } else {
      input.classList.add('contagem-salvo');
    }
  } catch (err) {
    console.warn('Erro ao salvar contagem:', err.message);
  }
}

async function limparContagemItem(itemCode, loc) {
  const input = document.querySelector(`.contagem-input[data-item="${CSS.escape(itemCode)}"][data-loc="${CSS.escape(loc)}"]`);
  if (!input) return;
  const celula = input.closest('td');
  const diffSlot = celula.querySelector('.diff-slot');
  const clearBtn = celula.querySelector('.contagem-clear-btn');
  input.value = '';
  input.classList.remove('contagem-salvo', 'contagem-divergente');
  if (diffSlot) diffSlot.innerHTML = '';
  if (clearBtn) clearBtn.style.display = 'none';
  delete contagemMap[chaveContagem(itemCode, loc)];
  try {
    await sb.from('contagem_fisica').delete().eq('item', itemCode).eq('unidade', unidadeAtual).eq('localizacao', loc);
  } catch (err) {
    console.warn('Erro ao limpar item:', err.message);
  }
}

document.getElementById('tableBody').addEventListener('change', (e) => {
  if (e.target.classList.contains('contagem-input')) salvarContagemItem(e.target);
});
document.getElementById('tableBody').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('contagem-input') && e.key === 'Enter') e.target.blur();
});
document.getElementById('tableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.contagem-clear-btn');
  if (btn) limparContagemItem(btn.dataset.item, btn.dataset.loc);
});

fichaModal.addEventListener('click', (e) => {
  if (e.target === fichaModal) closeFichaModal();
});

// ---- Modal de Comparação entre Unidades ----
const compareModal = document.getElementById('compareModal');
const compareModalBox = document.getElementById('compareModalBox');

function closeCompareModal() {
  compareModal.classList.remove('open');
}

async function openCompareModal(itemCode) {
  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn">✕</button>
    <div class="modal-empty">Carregando...</div>
  `;
  compareModal.classList.add('open');
  document.getElementById('compareCloseBtn').addEventListener('click', closeCompareModal);

  const { data, error } = await sb.from('estoque').select('*').eq('item', itemCode);

  // Agrupa por unidade, somando a quantidade de TODOS os endereços daquela unidade
  const porUnidade = {};
  (data || []).forEach(r => {
    if (!porUnidade[r.unidade]) {
      porUnidade[r.unidade] = { totalQtd: 0, locais: [], descricao: r.descricao };
    }
    porUnidade[r.unidade].totalQtd += parseQtd(r.quantidade);
    if (r.localizacao) porUnidade[r.unidade].locais.push(r.localizacao);
  });

  // Ordena as unidades da maior quantidade total para a menor (quem não tem o item fica por último)
  const codigosOrdenados = Object.keys(UNIDADES).sort((a, b) => {
    const qa = porUnidade[a] ? porUnidade[a].totalQtd : -1;
    const qb = porUnidade[b] ? porUnidade[b].totalQtd : -1;
    return qb - qa;
  });

  const maiorQtd = Math.max(...codigosOrdenados.map(c => porUnidade[c] ? porUnidade[c].totalQtd : -1));

  const linhas = codigosOrdenados.map(cod => {
    const u = UNIDADES[cod];
    const r = porUnidade[cod];
    const ehAtual = cod === unidadeAtual;
    const ehMaior = r && r.totalQtd === maiorQtd && maiorQtd > -1;
    let estilo = '';
    if (ehMaior) estilo = 'background:#fff8e6;';
    else if (ehAtual) estilo = 'background:var(--row-alt);';

    if (r) {
      const localTexto = r.locais.length > 1
        ? `${r.locais.length} locais`
        : (r.locais[0] || '-');
      return `
        <tr style="${estilo}">
          <td style="padding:9px 10px; font-weight:600;">${ehMaior ? '🏆 ' : ''}${escapeHtml(cod)} · ${escapeHtml(u.cidade)}</td>
          <td style="padding:9px 10px; text-align:right; font-weight:700; color:var(--blue-dark); white-space:nowrap;">${escapeHtml(r.totalQtd.toLocaleString('pt-BR'))}</td>
          <td style="padding:9px 10px; color:var(--muted); white-space:nowrap;" title="${escapeHtml(r.locais.join(', '))}">${escapeHtml(localTexto)}</td>
        </tr>`;
    }
    return `
      <tr style="${estilo}">
        <td style="padding:9px 10px; font-weight:600;">${escapeHtml(cod)} · ${escapeHtml(u.cidade)}</td>
        <td style="padding:9px 10px; text-align:right; color:var(--muted);" colspan="2">Não encontrado nessa unidade</td>
      </tr>`;
  }).join('');

  const totalGeral = codigosOrdenados.reduce((soma, cod) => soma + (porUnidade[cod] ? porUnidade[cod].totalQtd : 0), 0);

  const nomeItem = data && data[0] ? data[0].descricao : '';

  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn2">✕</button>
    <h3 style="padding-right:24px;">${escapeHtml(nomeItem || itemCode)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(itemCode)}</div>
    <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; table-layout:fixed;">
      <thead>
        <tr style="border-bottom:2px solid var(--border);">
          <th style="width:42%; text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Unidade</th>
          <th style="width:28%; text-align:right; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Quantidade</th>
          <th style="width:30%; text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Localização</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--border);">
          <td style="padding:10px; font-weight:700;">Total geral</td>
          <td style="padding:10px; text-align:right; font-weight:700; color:var(--ink);">${escapeHtml(totalGeral.toLocaleString('pt-BR'))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
  document.getElementById('compareCloseBtn2').addEventListener('click', closeCompareModal);
}

compareModal.addEventListener('click', (e) => {
  if (e.target === compareModal) closeCompareModal();
});

// ---- Modo Contagem (planilha de inventário com senha própria) ----
const contagemModal = document.getElementById('contagemModal');
const contagemPinInput = document.getElementById('contagemPinInput');
const contagemPinMsg = document.getElementById('contagemPinMsg');

let contagemMap = {};

async function carregarContagens() {
  const { data, error } = await sb.from('contagem_fisica').select('*').eq('unidade', unidadeAtual);
  contagemMap = {};
  (data || []).forEach(r => { contagemMap[chaveContagem(r.item, r.localizacao)] = r.quantidade_fisica; });
}

let canalContagem = null;

function atualizarLinhaNaTela(itemCode, loc, valor) {
  const input = document.querySelector(`.contagem-input[data-item="${CSS.escape(itemCode)}"][data-loc="${CSS.escape(loc)}"]`);
  if (!input) return; // item/endereço não está na tela (filtro/busca ativa) - não precisa atualizar
  // Não sobrescreve enquanto a própria pessoa está digitando naquele campo
  if (document.activeElement === input) return;
  const chave = chaveContagem(itemCode, loc);
  input.value = valor || '';
  if (valor) contagemMap[chave] = valor; else delete contagemMap[chave];
  const celula = input.closest('td');
  const diffSlot = celula.querySelector('.diff-slot');
  const clearBtn = celula.querySelector('.contagem-clear-btn');
  const caixasSlot = celula.querySelector('.caixas-slot');
  const linha = currentData.find(r => r.item === itemCode && r.localizacao === loc);
  input.classList.remove('contagem-salvo', 'contagem-divergente');
  if (clearBtn) clearBtn.style.display = valor ? 'inline-block' : 'none';
  if (caixasSlot) caixasSlot.innerHTML = valor ? formatarCaixas(valor, itemCode) : '';
  if (linha && diffSlot) {
    diffSlot.innerHTML = valor ? formatarDiferenca(valor, linha.quantidade) : '';
    if (valor) input.classList.add(parseQtd(valor) === parseQtd(linha.quantidade) ? 'contagem-salvo' : 'contagem-divergente');
  }
}

function iniciarTempoReal() {
  if (canalContagem) sb.removeChannel(canalContagem);
  canalContagem = sb.channel('contagem-' + unidadeAtual)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contagem_fisica', filter: `unidade=eq.${unidadeAtual}` },
      (payload) => {
        const row = (payload.eventType === 'DELETE') ? payload.old : payload.new;
        if (row && row.item && row.localizacao) {
          const valor = payload.eventType === 'DELETE' ? '' : row.quantidade_fisica;
          atualizarLinhaNaTela(row.item, row.localizacao, valor);
        }
        // Se a tela de "Quem já contou" estiver aberta, atualiza ela também sozinha
        if (quemContouModal.classList.contains('open')) renderizarQuemContou();
      })
    .subscribe();
}

function pararTempoReal() {
  if (canalContagem) {
    sb.removeChannel(canalContagem);
    canalContagem = null;
  }
}

async function limparTodasAsContagens() {
  const confirmado = confirm(`Isso vai apagar TODAS as quantidades de estoque físico digitadas na Unidade ${unidadeAtual}, pra todo mundo. Essa ação não pode ser desfeita. Confirma?`);
  if (!confirmado) return;
  try {
    await sb.from('contagem_fisica').delete().eq('unidade', unidadeAtual);
    contagemMap = {};
    document.querySelectorAll('.contagem-input').forEach(input => {
      input.value = '';
      input.classList.remove('contagem-salvo', 'contagem-divergente');
      const diffSlot = input.parentElement.querySelector('.diff-slot');
      const clearBtn = input.parentElement.querySelector('.contagem-clear-btn');
      if (diffSlot) diffSlot.innerHTML = '';
      if (clearBtn) clearBtn.style.display = 'none';
    });
  } catch (err) {
    alert('Erro ao limpar as contagens: ' + err.message);
  }
}

document.getElementById('limparContagemBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  limparTodasAsContagens();
});

// ---- Quem já contou (com detalhe por corredor, atualiza sozinho em tempo real) ----
const quemContouModal = document.getElementById('quemContouModal');
const quemContouBox = document.getElementById('quemContouBox');

function corredorDoItem(itemCode) {
  const linha = currentData.find(r => r.item === itemCode);
  if (!linha) return '?';
  return extrairLetraGrupo(linha.localizacao, 'corredor') || extrairLetraGrupo(linha.localizacao, 'cant') || 'Outros';
}

async function renderizarQuemContou() {
  const resumoContainer = document.getElementById('resumoContagemContainer');
  const { data, error } = await sb.from('contagem_fisica').select('item, localizacao, contado_por, contado_em').eq('unidade', unidadeAtual);

  if (error || !data || data.length === 0) {
    resumoContainer.innerHTML = `<div class="modal-empty">Ninguém registrou contagem ainda nesta unidade.</div>`;
    return;
  }

  // Agrupa por pessoa, e dentro de cada pessoa, por corredor
  const porPessoa = {};
  data.forEach(r => {
    const nome = r.contado_por || 'Sem nome';
    const corredor = extrairLetraGrupo(r.localizacao, 'corredor') || extrairLetraGrupo(r.localizacao, 'cant') || 'Outros';
    if (!porPessoa[nome]) porPessoa[nome] = { total: 0, ultima: null, corredores: {} };
    porPessoa[nome].total += 1;
    porPessoa[nome].corredores[corredor] = (porPessoa[nome].corredores[corredor] || 0) + 1;
    if (!porPessoa[nome].ultima || r.contado_em > porPessoa[nome].ultima) porPessoa[nome].ultima = r.contado_em;
  });

  const pessoas = Object.keys(porPessoa).sort((a, b) => porPessoa[b].total - porPessoa[a].total);
  const totalGeral = data.length;

  const linhas = pessoas.map(nome => {
    const p = porPessoa[nome];
    const horario = p.ultima ? new Date(p.ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
    const corredoresTexto = Object.keys(p.corredores).sort()
      .map(c => `Corredor ${c}: ${p.corredores[c]}`).join(' · ');
    return `
      <tr>
        <td style="padding:9px 10px; vertical-align:top;">
          <div style="font-weight:600;">${escapeHtml(nome)}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${escapeHtml(corredoresTexto)}</div>
        </td>
        <td style="padding:9px 10px; text-align:right; font-weight:700; color:var(--blue-dark); vertical-align:top;">${p.total}</td>
        <td style="padding:9px 10px; color:var(--muted); font-size:12px; white-space:nowrap; vertical-align:top;">${horario}</td>
      </tr>`;
  }).join('');

  resumoContainer.innerHTML = `
    <div class="modal-item-code" style="margin-top:0;">${totalGeral} item(ns) contado(s), por ${pessoas.length} pessoa(s) · atualiza sozinho</div>
    <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px;">
      <thead>
        <tr style="border-bottom:2px solid var(--border);">
          <th style="text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Pessoa / corredores</th>
          <th style="text-align:right; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Itens</th>
          <th style="text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Última</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}

function corredoresUnicos() {
  const corredorSet = new Set();
  const cantSet = new Set();
  currentData.forEach(r => {
    const loc = String(r.localizacao).trim().toUpperCase();
    const mCorredor = loc.match(/^([A-Z])-/);
    if (mCorredor) corredorSet.add(mCorredor[1]);
    const mCant = loc.match(/^CANT\s+([A-Z])\b/);
    if (mCant) cantSet.add(mCant[1]);
  });
  const grupos = [];
  [...corredorSet].sort().forEach(letra => grupos.push({ chave: letra, label: `Corredor ${letra}` }));
  [...cantSet].sort().forEach(letra => grupos.push({ chave: `CANT ${letra}`, label: `CANT ${letra}` }));
  return grupos;
}

async function renderizarAtribuicoes() {
  const container = document.getElementById('atribuicoesContainer');
  const grupos = corredoresUnicos();
  if (grupos.length === 0) {
    container.innerHTML = `<div style="font-size:12.5px; color:var(--muted);">Nenhum corredor identificado nesta unidade.</div>`;
    return;
  }
  const { data } = await sb.from('atribuicoes_corredor').select('*').eq('unidade', unidadeAtual);
  const atual = {};
  (data || []).forEach(r => { atual[r.corredor] = r.pessoa; });

  container.innerHTML = grupos.map(g => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="font-weight:700; color:var(--blue-dark); width:88px; flex-shrink:0; font-size:13px;">${escapeHtml(g.label)}</span>
      <input type="text" class="atribuicao-input" data-corredor="${escapeHtml(g.chave)}"
             value="${atual[g.chave] ? escapeHtml(atual[g.chave]) : ''}" placeholder="Nome da pessoa"
             style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
    </div>
  `).join('');
}

async function salvarAtribuicao(input) {
  const corredor = input.dataset.corredor;
  const pessoa = input.value.trim();
  try {
    await sb.from('atribuicoes_corredor').upsert(
      { unidade: unidadeAtual, corredor, pessoa: pessoa || null, atualizado_em: new Date().toISOString() },
      { onConflict: 'unidade,corredor' }
    );
  } catch (err) {
    console.warn('Erro ao salvar atribuição:', err.message);
  }
}

document.getElementById('quemContouBtn').addEventListener('click', async () => {
  quemContouBox.innerHTML = `
    <button class="modal-close" id="quemContouCloseBtn">✕</button>
    <h3 style="margin-top:0;">Contagem — Unidade ${escapeHtml(unidadeAtual)}</h3>

    <div class="modal-label">Responsável por corredor</div>
    <div id="atribuicoesContainer" style="margin-bottom:16px;"><div class="modal-empty">Carregando...</div></div>

    <div class="modal-label">Quem já contou</div>
    <div id="resumoContagemContainer"><div class="modal-empty">Carregando...</div></div>
  `;
  document.getElementById('quemContouCloseBtn').addEventListener('click', () => quemContouModal.classList.remove('open'));
  quemContouModal.classList.add('open');
  await renderizarAtribuicoes();
  await renderizarQuemContou();
  iniciarTempoRealAtribuicoes();
});

quemContouBox.addEventListener('change', (e) => {
  if (e.target.classList.contains('atribuicao-input')) salvarAtribuicao(e.target);
});
quemContouBox.addEventListener('keydown', (e) => {
  if (e.target.classList.contains('atribuicao-input') && e.key === 'Enter') e.target.blur();
});

let canalAtribuicoes = null;
function iniciarTempoRealAtribuicoes() {
  if (canalAtribuicoes) sb.removeChannel(canalAtribuicoes);
  canalAtribuicoes = sb.channel('atribuicoes-' + unidadeAtual)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'atribuicoes_corredor', filter: `unidade=eq.${unidadeAtual}` },
      (payload) => {
        const row = payload.new;
        if (!row) return;
        const input = document.querySelector(`.atribuicao-input[data-corredor="${CSS.escape(row.corredor)}"]`);
        if (input && document.activeElement !== input) input.value = row.pessoa || '';
      })
    .subscribe();
}

quemContouModal.addEventListener('click', (e) => {
  if (e.target === quemContouModal) quemContouModal.classList.remove('open');
});

function unidadeDesbloqueada(cod) {
  return sessionStorage.getItem('contagem_ok_' + cod) === '1';
}
function marcarUnidadeDesbloqueada(cod) {
  sessionStorage.setItem('contagem_ok_' + cod, '1');
}

async function ativarModoContagem() {
  modoContagemAtivo = true;
  marcarUnidadeDesbloqueada(unidadeAtual);
  await carregarContagens();
  document.querySelectorAll('.col-contagem').forEach(el => el.style.display = 'table-cell');
  document.querySelectorAll('.col-ficha, .col-unidades').forEach(el => el.style.display = 'none');
  contagemModal.classList.remove('open');
  contagemBtn.classList.add('active-toggle');
  document.getElementById('quemContouBtn').style.display = 'inline-block';
  applyFilterAndSort();
  iniciarTempoReal();
}

function desativarModoContagem() {
  modoContagemAtivo = false;
  document.querySelectorAll('.col-contagem').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.col-ficha, .col-unidades').forEach(el => el.style.display = '');
  contagemBtn.classList.remove('active-toggle');
  document.getElementById('quemContouBtn').style.display = 'none';
  applyFilterAndSort();
  pararTempoReal();
}

const contagemBtn = document.getElementById('contagemBtn');
contagemBtn.addEventListener('click', () => {
  if (modoContagemAtivo) {
    desativarModoContagem();
  } else if (unidadeDesbloqueada(unidadeAtual)) {
    // Já digitou a senha certa dessa unidade nesta mesma sessão do navegador - não pede de novo
    ativarModoContagem();
  } else {
    contagemPinInput.value = '';
    contagemPinMsg.textContent = '';
    const u = UNIDADES[unidadeAtual];
    document.getElementById('contagemHint').textContent =
      `Digite a senha da Unidade ${unidadeAtual} (${u.cidade}) para liberar a coluna de contagem física.`;
    contagemModal.classList.add('open');
  }
});

document.getElementById('contagemPinSubmit').addEventListener('click', () => {
  if (contagemPinInput.value === PINS_CONTAGEM[unidadeAtual]) {
    ativarModoContagem();
  } else {
    contagemPinMsg.textContent = 'Senha incorreta.';
  }
});

contagemPinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('contagemPinSubmit').click();
});

document.getElementById('contagemCloseBtn').addEventListener('click', () => {
  contagemModal.classList.remove('open');
});

contagemModal.addEventListener('click', (e) => {
  if (e.target === contagemModal) contagemModal.classList.remove('open');
});

document.getElementById('searchBox').addEventListener('input', applyFilterAndSort);
document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('searchBox').value = '';
  filtros = { localizacao: '', um: '', zerado: false, comFoto: false, divergente: false };
  document.getElementById('filterZerado').checked = false;
  document.getElementById('filterComFoto').checked = false;
  document.getElementById('filterDivergente').checked = false;
  atualizarBadgeFiltros();
  applyFilterAndSort();
});
document.getElementById('printBtn').addEventListener('click', () => window.print());

// ---- Painel de Filtros ----
const filterModal = document.getElementById('filterModal');
document.getElementById('filterBtn').addEventListener('click', () => {
  popularFiltrosDropdown();
  document.getElementById('filterZerado').checked = filtros.zerado;
  document.getElementById('filterComFoto').checked = filtros.comFoto;
  document.getElementById('filterDivergente').checked = filtros.divergente;
  filterModal.classList.add('open');
});
document.getElementById('filterCloseBtn').addEventListener('click', () => filterModal.classList.remove('open'));
filterModal.addEventListener('click', (e) => { if (e.target === filterModal) filterModal.classList.remove('open'); });

document.getElementById('filterApplyBtn').addEventListener('click', () => {
  filtros.localizacao = document.getElementById('filterLocalizacao').value;
  filtros.um = document.getElementById('filterUm').value;
  filtros.zerado = document.getElementById('filterZerado').checked;
  filtros.comFoto = document.getElementById('filterComFoto').checked;
  filtros.divergente = document.getElementById('filterDivergente').checked;
  atualizarBadgeFiltros();
  applyFilterAndSort();
  filterModal.classList.remove('open');
});

document.getElementById('filterClearAllBtn').addEventListener('click', () => {
  filtros = { localizacao: '', um: '', zerado: false, comFoto: false, divergente: false };
  document.getElementById('filterLocalizacao').value = '';
  document.getElementById('filterUm').value = '';
  document.getElementById('filterZerado').checked = false;
  document.getElementById('filterComFoto').checked = false;
  document.getElementById('filterDivergente').checked = false;
  atualizarBadgeFiltros();
  applyFilterAndSort();
});

document.querySelectorAll('thead th').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = 1; }
    document.querySelectorAll('thead th .arrow').forEach(a => a.textContent = '');
    th.querySelector('.arrow').textContent = sortDir === 1 ? '▲' : '▼';
    applyFilterAndSort();
  });
});

const editPanel = document.getElementById('editPanel');
const pinGateArea = document.getElementById('pinGateArea');
const editFormArea = document.getElementById('editFormArea');
const pinInput = document.getElementById('pinInput');
const pinMsg = document.getElementById('pinMsg');
const pasteArea = document.getElementById('pasteArea');
const saveMsg = document.getElementById('saveMsg');

document.getElementById('toggleEditBtn').addEventListener('click', () => {
  editPanel.classList.toggle('open');
});

document.getElementById('pinSubmitBtn').addEventListener('click', () => {
  if (pinInput.value === EDIT_PIN) {
    pinGateArea.style.display = 'none';
    editFormArea.style.display = 'block';
    pasteArea.value = currentData.map(r => [r.item, r.descricao, r.um, r.localizacao, r.quantidade].join('\t')).join('\n');
  } else {
    pinMsg.textContent = 'PIN incorreto.';
  }
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  editPanel.classList.remove('open');
});

document.getElementById('saveDataBtn').addEventListener('click', async () => {
  const records = parsePastedTsv(pasteArea.value).map(r => ({ ...r, unidade: unidadeAtual, atualizado_por: nomeUsuarioAtual }));
  if (records.length === 0) {
    saveMsg.textContent = 'Nenhum item válido encontrado no texto colado.';
    saveMsg.className = 'status-msg status-err';
    return;
  }
  saveMsg.textContent = 'Salvando no banco de dados...';
  saveMsg.className = 'status-msg';
  try {
    // Apaga só os itens DESSA unidade e insere a nova lista (abordagem simples e previsível)
    const { error: delError } = await sb.from('estoque').delete().eq('unidade', unidadeAtual);
    if (delError) throw delError;
    const { error: insError } = await sb.from('estoque').insert(records);
    if (insError) throw insError;
    saveMsg.textContent = `Atualizado! ${records.length} itens da Unidade ${unidadeAtual} publicados para todos que abrirem o link.`;
    saveMsg.className = 'status-msg status-ok';
    await loadData();
  } catch (e) {
    saveMsg.textContent = 'Erro ao salvar: ' + e.message;
    saveMsg.className = 'status-msg status-err';
  }
});

// Chamada pelo seletor de unidade do cabecalho (js/navegacao.js). Antes era
// um listener nos botoes de unidade, que sairam do layout na Fase 2b.
async function trocarUnidade(cod) {
  if (!UNIDADES[cod] || cod === unidadeAtual) return;
  const estavaContando = modoContagemAtivo;
  unidadeAtual = cod;
  atualizarSubtituloUnidade();
  document.getElementById('searchBox').value = '';
  sortKey = null;
  filtros = { localizacao: '', um: '', zerado: false, comFoto: false, divergente: false };
  atualizarBadgeFiltros();
  if (modoContagemAtivo) desativarModoContagem();
  await loadData();
  await atualizarBotaoEditar();
  // Se a contagem estava ativa e a unidade ja foi desbloqueada nesta sessao,
  // mantem ativa sem pedir a senha de novo.
  if (estavaContando && unidadeDesbloqueada(unidadeAtual)) {
    await ativarModoContagem();
  }
}

