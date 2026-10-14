// Generates modus/data/seed/*.json from the arrays embedded in the approved
// design artboards (Serial Killer Database Layouts canvas, 2026-10-14).
// Values are copied verbatim; nothing is added or corrected here.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'seed') + '/';
const w = (f, o) => writeFileSync(OUT + f, JSON.stringify(o, null, 2) + '\n');

// ---- Ridgway: 49 counts --------------------------------------------------
// [count, name, age, lastSeen, found, t0, t1, site, basis, flags(D dna,P paint,L led,F frag), doe, idYear, schematicX, schematicY]
const V = [
  ['I','Wendy Lee Coffield',16,'1982-07-08','1982-07-15',1982.515,1982.534,'Green River, Kent','P','P',null,null,38.38,57.96],
  ['II','Debra Lynn Bonner',22,'1982-07-25','1982-08-12',1982.561,1982.611,'Green River, Kent','C','',null,null,37.83,58.71],
  ['III','Marcia Faye Chapman',31,'1982-08-01','1982-08-15',1982.58,1982.619,'Green River, Kent','P','D',null,null,38.46,56.5],
  ['IV','Cynthia Jean Hinds',17,'1982-08-11','1982-08-15',1982.608,1982.619,'Green River, Kent','C','',null,null,39.09,59.36],
  ['V','Opal Charmaine Mills',16,'1982-08-12','1982-08-15',1982.611,1982.619,'Green River bank, Kent','P','D',null,null,37.06,57.61],
  ['VI','Debra Lorraine Estes',15,'1982-09-20','1988-05-30',1982.717,1988.411,'Federal Way','P','P',null,null,32.74,73.56],
  ['VII','Carol Ann Christensen',21,'1983-05-03','1983-05-08',1983.334,1983.348,'Maple Valley','P','D',null,null,53.17,57.96],
  ['VIII','Gisele Ann Lovvorn',19,'1982-07-17','1982-09-25',1982.539,1982.731,'SeaTac airport south','C','',null,null,34.15,53.28],
  ['IX','Terry Rene Milligan',16,'1982-08-29','1984-04-01',1982.657,1984.249,'Star Lake Rd','C','',null,null,36.26,62.64],
  ['X','Alma Ann Smith',18,'1983-03-03','1984-04-02',1983.167,1984.252,'Star Lake Rd','C','',null,null,35.72,63.39],
  ['XI','Delores LaVerne Williams',17,'1983-03','1984-03-31',1983.2,1984.246,'Star Lake Rd','C','F',null,null,36.35,61.18],
  ['XII','Gail Lynn Mathews',23,'1983-04-10','1983-09-18',1983.271,1983.712,'Star Lake Rd','C','',null,null,36.98,64.04],
  ['XIII','Sandra Kay Gabbert',17,'1983-04-17','1984-04-01',1983.29,1984.249,'Star Lake Rd','C','',null,null,34.94,62.29],
  ['XIV','Carrie Ann Rois',15,'1983-05','1985-03-10',1983.367,1985.186,'Star Lake Rd','C','',null,null,37.52,61.45],
  ['XV','Mary Bridget Meehan',19,'1982-09-15','1983-11-13',1982.704,1983.865,'SeaTac airport south','C','',null,null,34.85,51.71],
  ['XVI','Andrea M. Childers',19,'1983-04-14','1989-10-11',1983.282,1989.775,'SeaTac airport south','C','',null,null,34.31,52.46],
  ['XVII','Constance Elizabeth Naon',20,'1983-06-08','1983-10-27',1983.433,1983.819,'SeaTac airport south','C','',null,null,34.94,50.25],
  ['XVIII','Kelly Marie Ware',22,'1983-07-18','1983-10-29',1983.542,1983.824,'SeaTac airport south','C','',null,null,35.57,53.11],
  ['XIX','Linda Jane Rule',16,'1982-09-26','1983-01-31',1982.734,1983.082,'Northwest Hospital, Seattle','C','',null,null,32.74,6.29],
  ['XX','Denise Darcel Bush',23,'1982-10-08','1985-06',1982.767,1985.452,'Tigard, OR / Tukwila','C','',null,null,null,null],
  ['XXI','Shirley Marie Sherrill',18,'1982-10','1985-06',1982.786,1985.452,'Tigard, OR','C','',null,null,null,null],
  ['XXII','Shawnda Leea Summers',17,'1982-10','1983-08-11',1982.786,1983.608,'SeaTac airport north','C','',null,null,34.85,45.46],
  ['XXIII','Cheryl Lee Wims',18,'1983-05-23','1984-03-22',1983.389,1984.222,'SeaTac airport north','C','F',null,null,34.15,45.46],
  ['XXIV','Wendy Stephens',14,null,'1984-03-21',null,1984.219,'SeaTac airport north','C','','B10',2021,33.61,46.21],
  ['XXV','Colleen Renee Brockman',15,'1982-12-24','1984-05-26',1982.977,1984.4,'Jovita Blvd, Pierce County','C','',null,null,36.97,78.23],
  ['XXVI','Kimi-Kai Pitsor',16,'1983-04-17','1983-12-14',1983.29,1983.95,'Mountain View Cemetery, Auburn','C','',null,null,39.08,73.56],
  ['XXVII','Sandra Denise Major',20,'1982-12-24','1985-12-30',1982.977,1985.994,'Mountain View Cemetery, Auburn','C','','B16',2012,38.54,74.3],
  ['XXVIII','Lori Anne Razpotnik',15,null,'1985-12',null,1985.953,'Mountain View Cemetery, Auburn','C','','B17',2023,39.17,72.09],
  ['XXIX','Marie M. Malvar',18,'1983-04-30','2003-09-28',1983.326,2003.739,'Auburn ravine','L','L',null,2003,38.38,70.44],
  ['XXX','Martina Theresa Authorlee',18,'1983-05-22','1984-11-14',1983.386,1984.871,'SR 410, Enumclaw','C','',null,null,63.74,93.79],
  ['XXXI','Debbie May Abernathy',26,'1983-09-05','1984-03-31',1983.676,1984.246,'SR 410, Enumclaw','C','',null,null,63.2,94.53],
  ['XXXII','Mary Sue Bello',25,'1983-10-11','1984-10-12',1983.775,1984.78,'SR 410, Enumclaw','C','',null,null,63.82,92.32],
  ['XXXIII','Pammy Annette Avent',16,'1983-10-26','2003-08',1983.816,2003.619,'SR 410, Enumclaw','L','L',null,2003,64.45,95.18],
  ['XXXIV','Roberta Joseph Hayes',21,'1987-02-07','1991-09-11',1987.101,1991.693,'SR 410, Enumclaw','C','',null,null,62.42,93.44],
  ['XXXV','Marta Reeves',36,'1990-03','1990-09-20',1990.2,1990.717,'SR 410, Enumclaw','C','',null,1991,64.99,92.59],
  ['XXXVI','Yvonne Shelly Antosh',19,'1983-05-31','1983-10',1983.411,1983.786,'Auburn–Black Diamond Rd','C','',null,null,43.31,70.44],
  ['XXXVII','Tina Marie Thompson',22,'1983-07-25','1984-04-20',1983.561,1984.301,'SR 18 & I-90','C','F',null,1986,64.44,37.64],
  ['XXXVIII','April Dawn Buttram',17,'1983-08-18','2003-08-30',1983.627,2003.66,'Snoqualmie area','L','L',null,2003,63.9,38.39],
  ['XXXIX','Maureen Sue Feeney',19,'1983-09-28','1986-05-02',1983.739,1986.331,'SR 18 & I-90','C','',null,null,64.53,36.18],
  ['XL','Tracy Ann Winston',19,'1983-09-12','1986-03',1983.695,1986.2,'Cottonwood Park, Kent','C','',null,1999,39.63,56.76],
  ['XLI','Delise Louise Plager',22,'1983-10-30','1984-02-14',1983.827,1984.12,'I-90 Exit 38, North Bend','C','',null,1985,79.94,50.15],
  ['XLII','Kimberly L. Nelson',21,'1983-11-01','1986-06',1983.832,1986.452,'I-90 Exit 38, North Bend','C','',null,null,79.4,50.9],
  ['XLIII','Lisa Lorraine Yates',19,'1983-12','1984-03-13',1983.953,1984.197,'I-90 Exit 38, North Bend','C','',null,null,80.03,48.69],
  ['XLIV','Mary Exzetta West',16,'1984-02-06','1985-09-08',1984.099,1985.684,'Seward Park, Seattle','C','',null,null,38.38,32.95],
  ['XLV','Cindy Anne Smith',17,'1984-03-13','1987-06-27',1984.197,1987.485,'SE 312th Way off SR 18','C','',null,null,42.76,71.19],
  ['XLVI','Patricia Michelle Barczak',19,'1986-10-17','1993-02',1986.791,1993.123,'SR 18 near the raceway','C','',null,null,45.42,68.88],
  ['XLVII','Patricia Ann Yellowrobe',38,null,'1998-08-06',null,1998.594,'South Park, Seattle','C','',null,null,34.15,37.64],
  ['XLVIII','Tammie Charlene Liles',16,'1983-06-09','2003-08',1983.435,2003.619,'Kent–Des Moines Rd','L','L','B20',2024,36.26,59.52],
  ['2011','Rebecca Marrero',20,'1982-12-03','2010-12-21',1982.92,2010.969,'Auburn ravine','C','',null,null,37.83,71.19]
];
const BASIS = { P: 'physical', L: 'led_to_remains', C: 'confession' };
const counts = V.map(([count, name, age, lastSeen, found, , , site, basis, flags, doe, idYear, sx, sy], i) => ({
  seq: i + 1,
  count,                                   // Roman numeral in the 2003 Second Amended Information; '2011' = the Marrero count
  proceeding: count === '2011' ? 'ridgway-2011' : 'ridgway-2003',
  victim: name,
  ageAtDeath: age,
  lastSeen,                                // ISO date, or YYYY-MM when only the month is in the record, or null
  found,
  recoverySite: site,
  basis: BASIS[basis],                     // what the conviction rests on
  dna: flags.includes('D'),
  paint: flags.includes('P'),
  ledToRemains: flags.includes('L'),
  partialRemains: flags.includes('F'),
  pleadedAsJaneDoe: doe,                   // Jane Doe designation in the plea, or null
  identifiedYear: idYear,                  // year of a later identification, or null
  schematic: sx == null ? null : { x: sx, y: sy }   // design-canvas percent coords on the Puget Sound schematic; approximate to the named site
}));
w('ridgway-counts.json', { offender: 'gary-ridgway', source: 'Second Amended Information & Prosecutor\'s Summary of the Evidence (2003); plea of Feb 18, 2011 for Marrero', counts });

// ---- Ridgway: investigation timeline --------------------------------------
const E = [
  ['1982-08','i','Port of Seattle officer finds Ridgway parked on a dead-end road near S 192nd St.'],
  ['1982-08-16','i','King County forms the multi-agency Green River Task Force.'],
  ['1983-05-04','i','Des Moines police question Ridgway after Marie Malvar’s boyfriend identifies his truck. He denies contact.'],
  ['1984-02','i','Ridgway mails a letter to a newspaper meant to mislead investigators.'],
  ['1984-03','i','Task Force expanded. That spring Ridgway moves the remains of Bush and Sherrill to Tigard, Oregon.'],
  ['1984-05','i','Ridgway contacts the Task Force, is interviewed and passes a polygraph.'],
  ['1984-12','i','A woman reports Ridgway choked her on Pacific Hwy S in 1982. He admits it when questioned.'],
  ['1987-04-08','i','Search warrant on his home, work locker and vehicles. Saliva sample taken.'],
  ['1988','f','Evidence sent to a private lab. No DNA profiles obtainable with existing methods.'],
  ['1991-07','i','Task Force reduced to one investigator, Det. Tom Jensen.'],
  ['1999-11-02','f','Remains found in 1986 identified as Tracy Winston by mitochondrial DNA.'],
  ['2001-03','f','Jensen submits victims’ evidence to the Washington State Patrol Crime Lab.'],
  ['2001-09','f','WSP lab STR typing matches Ridgway to Chapman, Mills and Christensen.'],
  ['2001-11-16','i','Arrested in a prostitution sting on Pacific Hwy S and released the same day.'],
  ['2001-11-30','i','Arrested for murder leaving the Kenworth plant in Renton.'],
  ['2001-12-05','c','Charged with four counts: Christensen, Hinds, Chapman, Mills.'],
  ['2002-04-15','c','Prosecutor gives notice of intent to seek the death penalty.'],
  ['2003-03','f','Microtrace finds DuPont Imron paint spheres on Coffield’s and Estes’s clothing.'],
  ['2003-03-27','c','Three counts added: Coffield, Bonner, Estes.'],
  ['2003-06-13','c','Plea agreement: cooperation and guilty pleas in exchange for no death penalty.'],
  ['2003-08','f','Ridgway leads investigators to remains of Avent, Buttram and Jane Doe B20.'],
  ['2003-09-28','f','Marie Malvar’s remains recovered in an Auburn ravine.'],
  ['2003-11-05','c','Pleads guilty to 48 counts of aggravated first-degree murder.'],
  ['2003-12-18','c','48 consecutive life terms without parole (Judge Richard A. Jones).'],
  ['2010-12-21','f','Teenagers find Rebecca Marrero’s skull in an Auburn ravine.'],
  ['2011-02-18','c','Pleads guilty to the Marrero murder. 49th consecutive life term.'],
  ['2012-06-18','f','Jane Doe B16 identified as Sandra Major.'],
  ['2021-01-25','f','Jane Doe B10 identified as Wendy Stephens by genetic genealogy.'],
  ['2023-12','f','Jane Doe B17 identified as Lori Razpotnik by genetic genealogy.'],
  ['2024-01-22','f','Jane Doe B20 identified as Tammie Liles.'],
  ['2024-09-09','i','Moved to King County Jail to help search for remains. Returned to Walla Walla Sept 13.']
];
const LANE = { i: 'investigation', f: 'forensics', c: 'court' };
w('ridgway-events.json', { offender: 'gary-ridgway', events: E.map(([date, lane, text], i) => ({ seq: i + 1, date, lane: LANE[lane], text })) });

// ---- Ridgway: documents ----------------------------------------------------
w('ridgway-documents.json', { offender: 'gary-ridgway', documents: [
  { id: 'ridgway-prosecutor-summary-2003', kind: 'evidence_summary', title: "Prosecutor's Summary of the Evidence", publisher: 'King County Prosecuting Attorney', date: '2003-11-05', pages: 138, url: 'http://seattletimes.nwsource.com/news/local/links/ridg_summary.pdf', archiveUrl: 'https://web.archive.org/web/2005id_/http://seattletimes.nwsource.com/news/local/links/ridg_summary.pdf' },
  { id: 'ridgway-second-amended-information-2003', kind: 'charging_document', title: 'Second Amended Information (48 counts)', publisher: 'King County Superior Court No. 01-1-10270-9 SEA', date: '2003', url: 'http://seattletimes.nwsource.com/news/local/links/second_amended_info.pdf', archiveUrl: 'https://web.archive.org/web/20050308163920id_/http://seattletimes.nwsource.com:80/news/local/links/second_amended_info.pdf' },
  { id: 'ridgway-plea-agreement-2003', kind: 'plea', title: 'Plea Agreement', publisher: 'King County Superior Court', date: '2003-06-13', url: 'http://seattletimes.nwsource.com/news/local/links/plea_agreement.pdf', archiveUrl: null },
  { id: 'ridgway-statement-on-plea-2003', kind: 'plea', title: 'Statement of Defendant on Plea of Guilty', publisher: 'King County Superior Court', date: '2003-11-05', url: 'http://seattletimes.nwsource.com/news/local/links/statement_of_defendant.pdf', archiveUrl: null },
  { id: 'kcso-green-river', kind: 'agency', title: 'Green River homicides investigation', publisher: "King County Sheriff's Office", date: null, url: 'https://kingcounty.gov/en/dept/sheriff/courts-jails-legal-system/sheriff-services/investigations/green-river', archiveUrl: null },
  { id: 'seattle-times-green-river-index', kind: 'reporting_archive', title: 'The Green River Killings: documents & maps', publisher: 'The Seattle Times', date: null, url: 'https://special.seattletimes.com/o/html/greenriverkillings/index.html', archiveUrl: null }
]});

// ---- Ridgway: vitals / narrative (as shown on the approved dossier) --------
w('ridgway-profile.json', {
  slug: 'gary-ridgway', name: 'Gary Leon Ridgway', alias: 'The Green River Killer',
  caption: 'State of Washington v. Gary Leon Ridgway · King County Superior Court No. 01-1-10270-9 SEA',
  caseNumber: '01-1-10270-9 SEA', court: 'King County Superior Court',
  lede: 'A truck painter at the Kenworth plant for thirty years, Ridgway pleaded guilty in 2003 to 48 counts of aggravated first-degree murder and in 2011 to a 49th. His victims were women and girls, many of them last seen on Pacific Highway South. He was questioned in 1983 and passed a polygraph in 1984. A saliva sample taken from him in 1987 matched three victims in 2001, once the science caught up. The plea traded his cooperation for his life, and 40 of the 49 convictions rest on his own confession and knowledge of the sites.',
  vitals: [
    { k: 'Born', v: 'February 18, 1949 · Salt Lake City, Utah' },
    { k: 'Employer', v: 'Kenworth Truck Co., painter, Aug 1971 – Nov 2001' },
    { k: 'Arrested', v: 'November 30, 2001, leaving the Renton plant' },
    { k: 'Charged', v: 'December 5, 2001 · four counts' },
    { k: 'Pleaded', v: 'November 5, 2003 (48) · February 18, 2011 (1)' },
    { k: 'Sentence', v: '49 consecutive life terms without parole' },
    { k: 'Judges', v: 'Richard A. Jones (2003) · Mary E. Roberts (2011)' },
    { k: 'Prosecutor', v: 'Norm Maleng, King County' },
    { k: 'Held at', v: 'Washington State Penitentiary, Walla Walla' }
  ],
  chain: [
    { y: '1983', h: 'Questioned', t: 'Des Moines police question him after Marie Malvar’s boyfriend identifies his truck. He denies contact.', key: false },
    { y: '1984', h: 'Polygraph passed', t: 'He contacts the task force himself, is interviewed, and passes a polygraph.', key: false },
    { y: '1987', h: 'Sample taken', t: 'April 8 search warrant on his home, locker and vehicles. A saliva sample is collected.', key: true },
    { y: '1988', h: 'Science not ready', t: 'A private lab cannot obtain DNA profiles from the victims’ evidence.', key: false },
    { y: '2001', h: 'The match', t: 'WSP Crime Lab STR typing ties him to Chapman, Mills and Christensen in September.', key: true },
    { y: '2001', h: 'Arrest', t: 'November 30, leaving the Kenworth plant in Renton. Charged with four counts.', key: false },
    { y: '2003', h: 'Paint & plea', t: 'Kenworth’s Imron paint found on two victims’ clothing. He trades cooperation for his life.', key: false }
  ],
  countNarratives: {
    'I': {
      establishes: [
        'Last seen July 8, 1982. Her body was found July 15, 1982 in the Green River near the Peck Bridge in Kent, the first of the series.',
        'The ligature was a pair of jeans. In 2003 Microtrace (Skip Palenik) found sprayed DuPont Imron paint spheres on them.',
        'Imron was the paint used at the Kenworth truck plant, where Ridgway worked as a painter from August 1971 until his arrest.',
        "The paint finding came in March 2003, before the court's March 28 charging deadline. Counts for Coffield, Bonner and Estes were added on March 27, 2003.",
        'He pleaded guilty to the count on November 5, 2003.'
      ]
    },
    'XLVII': { establishes: ['The medical examiner had ruled the death an overdose, and hair DNA excluded Ridgway. The conviction rests on the confession alone.'] }
  },
  mapNote: 'Forty-seven of the 49 were recovered in King County or just over the line in Pierce County, most in the south-county corridor and along SR 18, SR 410 and I-90.',
  offMapNote: '2 victims (Bush, Sherrill). Ridgway moved their remains to Tigard, Oregon in spring 1984 to mislead the task force.',
  mapStat: { label: 'King County · female · weapon "other/unknown" · 1980s', solved: 6, victims: 47, usFemaleClearance: 76.9, source: 'MAP SHR 1980–2014' }
});

// ---- Index: 31 offenders ---------------------------------------------------
// [name, alias, status, court, claimed, first, last, caught, states, methods, victims, howCat, howText]
const O = [
  ['Gary Ridgway','Green River Killer','pleaded',49,71,1982,1998,2001,'WA','strangulation','Sex workers and runaway girls and young women','Forensic science','DNA re-test of a 1987 saliva sample'],
  ['Ted Bundy',null,'convicted',3,30,1974,1978,1978,'WA OR UT CO ID FL','blunt force, strangulation','Young women and girls, mostly college-age','Traffic stop or ticket','Stopped in a stolen VW, Pensacola'],
  ['John Wayne Gacy',null,'convicted',33,33,1972,1978,1978,'IL','strangulation','Teenage boys and young men','Investigation','Missing-person case of Robert Piest'],
  ['Jeffrey Dahmer',null,'convicted',16,17,1978,1991,1991,'WI OH','strangulation','Young men and boys','Survivor or witness','Tracy Edwards escaped and flagged police'],
  ['Joseph James DeAngelo','Golden State Killer','pleaded',13,13,1975,1986,2018,'CA','firearm, blunt force','Couples and women in suburban homes','Forensic science','Genetic genealogy (GEDmatch)'],
  ['Samuel Little',null,'convicted',8,93,1970,2005,2012,'15 states','strangulation','Marginalized women','Forensic science','Drug-warrant arrest, DNA cold hit to LA murders'],
  ['Dennis Rader','BTK','pleaded',10,10,1974,1991,2005,'KS','strangulation','Women and families in their homes','Records & documents','Floppy-disk metadata, familial DNA'],
  ['Edmund Kemper',null,'convicted',8,10,1964,1973,1973,'CA','mixed','Hitchhikers, college students, his mother','Surrendered','Called police himself'],
  ['Robert Lee Yates Jr.',null,'convicted',15,16,1975,1998,2000,'WA','firearm','Women in street sex work','Forensic science','Victim blood and DNA in his former Corvette'],
  ['Lonnie David Franklin Jr.','Grim Sleeper','convicted',10,14,1985,2007,2010,'CA','firearm, strangulation','Black women in South LA','Forensic science','Familial DNA via his son'],
  ['Anthony Sowell',null,'convicted',11,11,2007,2009,2009,'OH','strangulation','Black women, many with addiction','Survivor or witness','Survivor reported an assault'],
  ['Darren Deon Vann',null,'pleaded',7,18,2013,2014,2014,'IN','strangulation','Women, many in sex work','Records & documents','Victim’s phone records'],
  ['Israel Keyes',null,'died',null,11,2001,2012,2012,'AK VT +','strangulation, firearm','Strangers chosen far from home','Traffic stop or ticket','Traced via a victim’s ATM card'],
  ['Joel Rifkin',null,'convicted',9,17,1989,1993,1993,'NY','strangulation','Women in sex work','Traffic stop or ticket','Missing plate, body in his truck'],
  ['Richard Ramirez','Night Stalker','convicted',13,15,1984,1985,1985,'CA','mixed','Home-invasion victims, all ages','Survivor or witness','Recognized and subdued by residents'],
  ['Aileen Wuornos',null,'convicted',6,7,1989,1990,1991,'FL','firearm','Middle-aged male motorists','Forensic science','Fingerprint on a pawn receipt'],
  ['Juan Corona',null,'convicted',25,25,1971,1971,1971,'CA','knife, firearm','Migrant farmworkers','Investigation','His receipts found in the graves'],
  ['Randy Kraft','Scorecard Killer','convicted',16,67,1971,1983,1983,'CA OR MI','strangulation, blunt force','Young men, Marines, hitchhikers','Traffic stop or ticket','DUI stop with a victim in the car'],
  ['Lorenzo Gilyard',null,'convicted',6,13,1977,1993,2004,'MO','strangulation','Women, mostly in sex work','Forensic science','DNA cold-case review'],
  ['Todd Kohlhepp',null,'pleaded',7,7,2003,2016,2016,'SC','firearm','Shop staff, a couple, a captive’s boyfriend','Records & documents','Captive found via phone records'],
  ['Rex Heuermann','Gilgo Beach','pleaded',7,8,1993,2010,2023,'NY','strangulation','Women working as escorts','Records & documents','Vehicle tip, burner phones, discarded-pizza DNA'],
  ['Rodney Alcala',null,'convicted',7,9,1971,1979,1979,'CA NY','strangulation, blunt force','Young women and girls','Survivor or witness','Parole officer recognized a sketch'],
  ['William Bonin','Freeway Killer','convicted',14,21,1979,1980,1980,'CA','strangulation, knife','Teenage boys, hitchhikers','Investigation','Police surveillance'],
  ['David Berkowitz','Son of Sam','pleaded',6,6,1976,1977,1977,'NY','firearm','Young women and couples in cars','Traffic stop or ticket','A parking ticket'],
  ['Alan Wade Wilmer Sr.','Colonial Parkway','died',null,6,1986,1989,null,'VA','firearm, strangulation, knife','Young couples on secluded roads','Forensic science','Posthumous DNA match, named 2026'],
  ['Zodiac',null,'unk',null,5,1968,1969,null,'CA','firearm, knife','Couples at lovers’ lanes, a cab driver','Still open',''],
  ['I-70 Killer',null,'unk',null,6,1992,1992,null,'IN KS MO','firearm','Clerks in small shops near I-70','Still open',''],
  ['Freeway Phantom',null,'unk',null,6,1971,1972,null,'DC MD','strangulation','Black girls and young women, 10–18','Still open',''],
  ['New Bedford Highway Killer',null,'unk',null,11,1988,1989,null,'MA','strangulation, blunt force','Women from the Weld Square area','Still open',''],
  ['Cleveland Torso Murderer',null,'unk',null,12,1935,1938,null,'OH','knife','Transients and the working poor','Still open',''],
  ['Texarkana Phantom Killer',null,'unk',null,5,1946,1946,null,'TX AR','firearm','Couples on lovers’ lanes','Still open','']
];
const slug = s => s.toLowerCase().replace(/\./g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const STATUS = { pleaded: 'guilty_plea', convicted: 'convicted', died: 'died_uncharged', unk: 'unidentified' };
const HOW = { 'Forensic science':'forensic_science','Traffic stop or ticket':'traffic_stop','Survivor or witness':'survivor_or_witness','Records & documents':'records','Investigation':'investigation','Surrendered':'surrendered','Still open':'still_open' };
w('offenders.json', O.map(([name, alias, st, court, claimed, first, last, caught, states, methods, victims, howCat, howText]) => ({
  slug: slug(name), name, alias, legalStatus: STATUS[st],
  courtProvenCount: court,          // seed-level figure; the app recomputes from proceedings and must match
  attributedCount: claimed,         // highest credible attributed total (includes the proven counts)
  firstKillingYear: first, lastKillingYear: last, caughtYear: caught,
  states: states.split(' ').filter(s => /^[A-Z]{2}$/.test(s)), statesNote: /^[A-Z]{2}( [A-Z]{2})*$/.test(states) ? null : states,
  methods: methods.split(',').map(s => s.trim()), victimology: victims,
  howCaught: HOW[howCat], howCaughtText: howText || null,
  mobility: null, homeBase: null,
  diedYear: name === 'Alan Wade Wilmer Sr.' ? 2017 : (name === 'Israel Keyes' ? 2012 : null)
})));

// ---- Atlas: MAP clusters ---------------------------------------------------
// [county, state, weapon, victims, solved, firstYear, lastYear, mapX, mapY, kind]
const CL = [["Wayne","MI","Strangulation",179,58,1980,2003,72.76,34.25,"S"],["Fulton","GA","Strangulation",115,27,1980,2014,73.17,66.29,"S"],["King","WA","Other/unknown",95,22,1980,2014,10.74,8.37,"U"],["St. Louis city","MO","Other/unknown",100,32,1980,2013,61.43,49.75,"U"],["Prince George's","MD","Other/unknown",70,23,1980,2012,85.24,44,"U"],["Jackson","MO","Strangulation",65,20,1980,2012,54.04,48.8,"S"],["District of Columbia","DC","Strangulation",59,14,1980,2014,84.9,43.82,"S"],["Suffolk","NY","Other/unknown",41,13,1980,2014,91.08,34.03,"U"],["Dade","FL","Strangulation",28,7,1980,1987,83.67,94.6,"S"],["Orleans","LA","Strangulation",25,5,1980,2010,63.29,81.71,"S"],["Nassau","NY","Other/unknown",28,9,1980,2014,89.9,35,"U"],["District of Columbia","DC","Suffocation",23,7,1981,2014,84.9,43.82,"S"],["Marion","FL","Other/unknown",22,7,1980,2014,79.32,82.22,"U"],["Hidalgo","TX","Other/unknown",22,7,1981,2012,46.5,95.87,"U"],["Broward","FL","Strangulation",19,4,1981,1987,83.62,92.6,"S"],["St. Lucie","FL","Other/unknown",20,6,1980,2003,83.19,88.13,"U"],["Anchorage","AK","Other/unknown",18,5,1980,2013,11.83,89.28,"U"],["Hartford","CT","Strangulation",18,5,1982,2003,90.74,30.55,"S"],["Galveston","TX","Other/unknown",17,4,1984,2009,53.19,84.85,"U"],["Lake","IN","Fire",17,5,1980,2012,65.98,38.73,"X"],["Fort Bend","TX","Other/unknown",15,3,1983,2014,51.55,84.35,"U"],["Collier","FL","Other/unknown",16,5,1981,2006,81.85,93.21,"U"],["St. Clair","IL","Other/unknown",14,4,1980,1991,62.03,50.31,"U"],["Fulton","GA","Suffocation",13,3,1981,2006,73.17,66.29,"S"],["Putnam","FL","Other/unknown",13,4,1992,2007,79.81,80.6,"U"],["Salt Lake","UT","Strangulation",13,4,1980,2002,23.34,38.89,"S"],["Richmond","VA","Strangulation",11,2,1981,1996,85.86,47.19,"S"],["Snohomish","WA","Other/unknown",11,2,1980,2004,11.25,6.45,"U"],["Genesee","MI","Strangulation",11,3,1980,1999,71.82,31.65,"S"],["Clark","OH","Other/unknown",11,3,1982,2013,72.63,43.22,"U"],["McLennan","TX","Other/unknown",11,3,1982,2007,48.7,76.78,"U"],["Pinal","AZ","Other/unknown",10,2,1982,2013,21.41,67.91,"U"],["Washington","OR","Other/unknown",10,2,1985,2001,7.52,14.34,"U"],["Montgomery","OH","Strangulation",10,3,1981,2002,71.78,44.01,"S"],["Atlantic","NJ","Other/unknown",9,2,1981,2014,88.73,40.3,"U"],["Frederick","MD","Other/unknown",8,1,1981,2007,83.97,41.94,"U"],["San Mateo","CA","Fire",7,0,1997,1998,3.5,44.2,"X"],["Worcester","MA","Strangulation",8,2,1980,1996,91.8,28.01,"S"],["Berrien","MI","Other/unknown",8,2,1990,2010,67.52,36.46,"U"],["Racine","WI","Other/unknown",8,2,1983,2010,64.55,33.93,"U"],["Kaufman","TX","Other/unknown",7,1,1991,2014,50.52,72.89,"U"],["Plymouth","MA","Strangulation",6,0,1980,1993,93.85,28.69,"S"],["Pulaski","MO","Other/unknown",6,0,2001,2014,57.98,53.08,"U"],["Polk","FL","Strangulation",7,2,1980,1987,80.48,86.67,"S"],["De Kalb","GA","Suffocation",7,2,1989,2014,73.63,66.28,"S"],["Glynn","GA","Other/unknown",7,2,1982,2014,79.65,74.53,"U"],["Oldham","KY","Firearm",7,2,1980,2007,70.1,49.44,"X"],["Edgecombe","NC","Other/unknown",7,2,1991,2010,85.23,55.17,"U"],["Clark","WA","Strangulation",7,2,1982,1998,8.62,14,"S"],["Humboldt","CA","Strangulation",6,1,1984,1998,3.01,31.16,"S"],["Floyd","GA","Other/unknown",6,1,1985,2013,71.62,64.8,"U"],["Harford","MD","Other/unknown",6,1,1988,2007,85.81,41,"U"],["Vance","NC","Other/unknown",6,1,1998,2014,83.55,53.96,"U"],["Knox","TN","Strangulation",6,1,1985,1999,73.52,57.89,"S"]];
w('map-clusters.json', {
  dataset: 'Murder Accountability Project, Supplementary Homicide Report 1980–2014 (638,454 homicides)',
  method: 'Female victims grouped by county and weapon; flagged when victims >= 6 and solved share <= 1/3; lens = full 35 years',
  thresholds: { minVictims: 6, maxSolvedShare: 0.3333 },
  totals: { femaleVictims: 143345, femaleUnsolved: 33076, flagged: 54, flaggedNoGun: 53 },
  clusters: CL.map(([county, state, weapon, victims, solved, firstYear, lastYear, , , kind]) => ({ county, state, weapon, victims, solved, firstYear, lastYear, weaponClass: { S: 'strangulation_or_suffocation', U: 'other_unknown', X: 'other_named' }[kind] }))
});
// [county, weapon, decade, victims, solved, note]
const DW = [["New York County, NY","Other/unknown",1990,224,73,""],["Dade, FL","Other/unknown",1980,80,16,""],["Wayne, MI","Strangulation",1980,87,25,""],["King, WA","Other/unknown",1980,47,6,"Green River years. MAP says Ridgway's victims were coded with weapon other/unknown."],["Dallas, TX","Other/unknown",1980,56,16,""],["Fulton, GA","Strangulation",1990,43,6,""],["Cook, IL","Strangulation",2000,47,12,"Overlaps MAP's 2019 report of 51 strangled women in Chicago."],["Fulton, GA","Strangulation",1980,45,10,""],["Hillsborough, FL","Other/unknown",1980,39,4,""],["St. Louis city, MO","Other/unknown",1990,47,15,""],["Jackson, MO","Strangulation",1980,37,6,"Kansas City. Lorenzo Gilyard's convictions date to 1977–93."],["Milwaukee, WI","Other/unknown",1990,35,8,""]];
w('map-decade-clusters.json', { lens: 'by decade (top 12 by victims)', rows: DW.map(([place, weapon, decade, victims, solved, note]) => { const [county, state] = place.split(', '); return { county, state, weapon, decade, victims, solved, note: note || null }; }) });
w('map-summary.json', {
  unsolvedFemaleByDecade: [[1980, 47023, 12117], [1990, 44945, 11454], [2000, 35459, 6957], [2010, 15918, 2548]].map(([decade, victims, unsolved]) => ({ decade, victims, unsolved })),
  unsolvedFemaleByWeapon: [['Firearm', 11966], ['Knife or cutting', 5882], ['Blunt object', 5701], ['Other or unknown', 5371], ['Strangulation', 2562], ['Fire', 777], ['Suffocation', 558], ['All other', 259]].map(([weapon, n]) => ({ weapon, unsolved: n })),
  usFemaleClearance1980to2014: 76.9,
  caveats: ["Florida's rows stop around 1987.", 'Weapon "other/unknown" partly reflects agencies that report weapons poorly.', 'A flag is a reason to look, not a finding.']
});
console.log('ok');
