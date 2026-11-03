/**
 * Seed library: verbatim excerpts of two public-domain New Jersey Supreme Court opinions,
 * taken from CourtListener's text of each opinion (including source OCR errors such as
 * "tidal" for "trial" and "eases" for "cases", kept verbatim so quote checks stay honest).
 * Star pages are the official reporter pages. These are excerpts: import the full opinion
 * with a CourtListener token for complete text.
 */
export interface SeedCase {
  id: string; name: string; short_name: string; citation: string; citations: string[]; court: string; court_rank: number;
  date: string; reporter: string; volume: number; first_page: number; source: string; url: string; text: string; excerpt: boolean; tags: string[];
}

const OMIT = '[Excerpt: intervening text omitted. Import the full opinion for complete text.]';

export const SEED_CASES: SeedCase[] = [
  {
    id: 'cl:2381317',
    name: 'Brill v. Guardian Life Ins. Co. of Am.',
    short_name: 'Brill',
    citation: '142 N.J. 520',
    citations: ['142 N.J. 520', '666 A.2d 146'],
    court: 'Supreme Court of New Jersey',
    court_rank: 1,
    date: '1995-10-24',
    reporter: 'N.J.', volume: 142, first_page: 520,
    source: 'courtlistener',
    url: 'https://www.courtlistener.com/opinion/2381317/brill-v-guardian-life-insurance-co-of-america/',
    excerpt: true,
    tags: ['summary judgment', 'R. 4:46-2', 'standard of review', 'genuine issue of material fact'],
    text: `[*523] The opinion of the Court was delivered by COLEMAN, J.

This appeal involves a claim of negligence against a life-insurance broker and his agency for failing to advise a prospective insured of the possibility of securing immediate, temporary coverage upon completion of the application process. The trial court granted summary judgment holding the broker and his agency liable for the face value of the policy. The important question raised is whether the trial court incorrectly granted a summary judgment motion in favor of the insured. A subset of that question is whether the trial court engaged in an impermissible weighing of evidence to determine whether a genuine issue of material fact existed.

We hold that when deciding a motion for summary judgment under Rule 4:46-2, the determination whether there exists a genuine issue with respect to a material fact challenged requires the motion judge to consider whether the competent evidential materials presented, when viewed in the light most favorable to the non-moving party in consideration of the applicable evidentiary standard, are sufficient to permit a rational factfinder to resolve the alleged disputed issue in favor of the non-moving party. This assessment of the evidence is to be conducted in the same manner as that required under Rule 4:37-2(b).

Because the case was disposed of in a summary judgment proceeding, our statement of the facts is based on our consideration of the evidence in the light most favorable to the parties opposing summary judgment. Dairy Stores, Inc. v. Sentinel Publishing Co., Inc., 104 N.J. 125, 135, 516 A.2d 220 (1986); [*524] Judson v. Peoples Bank, & Trust Co. of Westfield, 17 N.J. 67, 75, 110 A.2d 24 (1954).

${OMIT}

[*528] Rule 4:46-2 provides that a court should grant summary judgment when “the pleadings, depositions, answers to interrogatories [*529] and admissions on file, together with the affidavits, if any, show that there is no genuine issue as to any material fact challenged and that the moving party is entitled to a judgment or order as a matter of law.”

${OMIT}

By its plain language, Rule 4:46-2 dictates that a court should deny a summary judgment motion only where the party opposing the motion has come forward with evidence that creates a “genuine issue as to any material fact challenged." That means a non-moving party cannot defeat a motion for summary judgment merely by pointing to any fact in dispute.

${OMIT}

[*539] Consistent with this national trend, we hold that under Rule 4:46-2, when deciding summary judgment motions trial [*540] courts are required to engage in the same type of evaluation, analysis or sifting of evidential materials as required by Rule 4:37-2(b) in light of the burden of persuasion that applies if the matter goes to trial. Accordingly, we request the Civil Practice Committee to recommend appropriate rule changes on an expedited basis that are necessary to implement the standard we establish today.

Under this new standard, a determination whether there exists a “genuine issue” of material fact that precludes summary judgment requires the motion judge to consider whether the competent evidential materials presented, when viewed in the light most favorable to the non-moving party, are sufficient to permit a rational factfinder to resolve the alleged disputed issue in favor of the non-moving party. The “judge’s function is not himself [or herself] to weigh the evidence and determine the truth of the matter but to determine whether there is a genuine issue for trial.” Liberty Lobby, supra, 477 U.S. at 249, 106 S.Ct. at 2511, 91 L.Ed.2d at 212. Credibility determinations will continue to be made by a jury and not the judge. If there exists a single, unavoidable resolution of the alleged disputed issue of fact, that issue should be considered insufficient to constitute a “genuine” issue of material fact for purposes of Rule 4:46-2. Liberty Lobby, supra, 477 U.S. at 250, 106 S.Ct. at 2511, 91 L.Ed.2d at 213. The import of our holding is that when the evidence “is so one-sided that one party must prevail as a matter of law,” Liberty Lobby, supra, 477 U.S. at 252, 106 S.Ct. at 2512, 91 L.Ed.2d at 214, the trial court should not hesitate to grant summary judgment.

D

It is critical that a trial court ruling on a summary judgment motion not “shut a deserving litigant from his [or her] trial.” Judson, supra, 17 N.J. at 77, 110 A.2d 24 (citation omitted). At the same time, we stress that it is just as important that the court not “allow harassment of an equally deserving suitor for immedi[*541]ate relief by a long and worthless trial.” Ibid, (citation omitted). What we said in Judson is worth repeating:

If these general rules are applied by the courts with discernment and care, the summary judgment procedure, without unjustly depriving a party of a trial, can effectively eliminate from crowded court calendars cases in which a trial would serve no useful purpose and cases in which the threat of tidal is used to coerce a settlement.

[Ibid, (quoting Asbill and Snell, Summary Judgment Under the Federal Rules, 51 Mich.L.Rev. 1143, 1172 (1953).]

To send a case to trial, knowing that a rational jury can reach but one conclusion, is indeed “worthless” and will “serve no useful purpose.”

The thrust of today’s decision is to encourage trial courts not to refrain from granting summary judgment when the proper circumstances present themselves. Some have suggested that trial courts out of fear of reversal, or out of an overly restrictive reading of Judson, supra, 17 N.J. at 67, 110 A.2d 24, or a combination thereof, allow eases to survive summary judgment so long as there is any disputed issue of fact. As to fear of reversal, we believe our judges are made of sterner stuff and have sought conscientiously over the years to follow the law. We may have permitted an encrustation of the Judson standard that obscured its essential import. A summary judgment motion has in the past required and will in the future continue to require a searching review. Millison v. E.I. du Pont de Nemours & Co., 101 N.J. 161, 167, 501 A.2d 505 (1985) (noting that Judson requires a “discriminating search” of the record to determine whether there exists a “genuine issue of material fact requiring disposition at trial”); see Ziemba v. Riverview Medical Center, 275 N.J.Super. 298, 298-303, 645 A.2d 1276 (1994).

${OMIT}

[*542] The trial court in the present case properly concluded that the evidence presented by KRA and Gould does not create a “genuine” issue of material fact under Rule 4:46-2. As the motion judge found, the competent evidential material presented leaves no doubt of any kind about whether Gould advised Brill of the availability of a conditional-receipt. By Gould’s own unequivocal admission, he did not.

${OMIT}

[*545] Finally, the competent evidential materials create no genuine issue of material fact with respect to whether Gould’s failure to advise Brill of the conditional-receipt option was a proximate cause of damages to plaintiff. We are satisfied that no reasonable jury could conclude, based on the facts in the record, that Gould’s negligence was not a proximate cause of Brill’s lack of an effective Guardian life-insurance policy at the time of his death.`,
  },
  {
    id: 'cl:9885187',
    name: 'Judson v. Peoples Bank & Trust Co. of Westfield',
    short_name: 'Judson',
    citation: '17 N.J. 67',
    citations: ['17 N.J. 67', '110 A.2d 24'],
    court: 'Supreme Court of New Jersey',
    court_rank: 1,
    date: '1954-12-13',
    reporter: 'N.J.', volume: 17, first_page: 67,
    source: 'courtlistener',
    url: 'https://www.courtlistener.com/opinion/2300512/judson-v-peoples-bank-trust-co-of-westfield/',
    excerpt: true,
    tags: ['summary judgment', 'discriminating search', 'R.R. 4:58'],
    text: `[*73] The summary judgment procedure was first introduced in England in 1855 and in New Jersey, among the first of the states, in our Practice Act of 1912. Clark and Samenov, The Summary Judgment, 38 Yale L. J. 423, 424, 442 (1929). Originally restricted to creditor claimants suing to recover upon liquidated debts and demands, modern pro[*74]cedural systems, particularly those like New Jersey’s, modeled upon the Federal Rules of Civil Procedure, 28 U. S. C. A., make summary judgment procedure available in any civil action and to claimants and defending parties alike. B. B. 4:58. It is designed to provide a prompt, businesslike and inexpensive method of disposing of any cause which a discriminating search of the merits in the pleadings, depositions and admissions on file, together with the affidavits submitted on the motion clearly shows not to present any genuine issue of material fact requiring disposition at a trial. Shientag, 4 Ford. L. Rev. 186 (1935). In conjunction with the pretrial discovery and pretrial conference procedures, the summary judgment procedure aims at “the swift uncovering of the merits and either their effective disposition or their advancement toward prompt resolution by trial.” Clark, The Summary Judgment, 36 Minn. L. Rev. 567, 579 (1952).

${OMIT}

[*77] «* * * What is needed is the application of common sense, good judgment, and decisive action, on the one hand, not to shut a deserving litigant from his trial and, on the other, not to allow harassment of an equally deserving suitor for immediate relief by a long and worthless trial.”

To which Asbill and Snell, at 51 Mich. L. Rev., supra, 1172, add:

“If these general rules are applied by the courts with discernment and care, the summary judgment procedure, without unjustly depriving a party of a trial, can effectively eliminate from crowded court calendars cases in which a trial would serve no useful purpose and cases in which the threat of a trial is used to coerce a settlement.”`,
  },
  {
    id: 'cl:2072920',
    name: 'Printing Mart-Morristown v. Sharp Elecs. Corp.',
    short_name: 'Printing Mart',
    citation: '116 N.J. 739',
    citations: ['116 N.J. 739', '563 A.2d 31'],
    court: 'Supreme Court of New Jersey',
    court_rank: 1,
    date: '1989-08-29',
    reporter: 'N.J.', volume: 116, first_page: 739,
    source: 'courtlistener',
    url: 'https://www.courtlistener.com/opinion/2072920/printing-mart-morristown-v-sharp-electronics-corp/',
    excerpt: true,
    tags: ['motion to dismiss', 'R. 4:6-2(e)', 'failure to state a claim', 'pleading standard'],
    text: `[*746] I

We approach our review of the judgment below mindful of the test for determining the adequacy of a pleading: whether a cause of action is “suggested” by the facts. Velantzas v. Colgate-Palmolive Co., 109 N.J. 189, 192 (1988). In reviewing a complaint dismissed under Rule 4:6-2(e) our inquiry is limited to examining the legal sufficiency of the facts alleged on the face of the complaint. Rieder v. Department of Transp., 221 N.J.Super. 547, 552 (App.Div.1987). However, a reviewing court “searches the complaint in depth and with liberality to ascertain whether the fundament of a cause of action may be gleaned even from an obscure statement of claim, opportunity being given to amend if necessary.” Di Cristofaro v. Laurel Grove Memorial Park, 48 N.J.Super. 244, 252 (App.Div.1957). At this preliminary stage of the litigation the Court is not concerned with the ability of plaintiffs to prove the allegation contained in the complaint. Somers Constr. Co. v. Board of Educ., 198 F.Supp. 732, 734 (D.N.J.1961). For purposes of analysis plaintiffs are entitled to every reasonable inference of fact. Independent Dairy Workers Union v. Milk Drivers Local 680, 23 N.J. 85, 89 (1956). The examination of a complaint’s allegations of fact required by the aforestated principles should be one that is at once painstaking and undertaken with a generous and hospitable approach.`,
  },
];

/** Starter quote bank: the passages New Jersey litigators reach for most. All verified on seed. */
export const SEED_QUOTES: Array<{ case_id: string; text: string; proposition: string; tags: string[]; note?: string }> = [
  { case_id: 'cl:2072920', text: 'searches the complaint in depth and with liberality to ascertain whether the fundament of a cause of action may be gleaned even from an obscure statement of claim, opportunity being given to amend if necessary', proposition: 'On a R. 4:6-2(e) motion the court reads the complaint generously', tags: ['motion to dismiss', 'R. 4:6-2(e)'], note: 'quoting Di Cristofaro v. Laurel Grove Memorial Park, 48 N.J. Super. 244, 252 (App. Div. 1957)' },
  { case_id: 'cl:2072920', text: 'our inquiry is limited to examining the legal sufficiency of the facts alleged on the face of the complaint', proposition: 'R. 4:6-2(e) review is confined to the face of the complaint', tags: ['motion to dismiss'] },
  { case_id: 'cl:2072920', text: 'at once painstaking and undertaken with a generous and hospitable approach', proposition: 'The examination of the complaint must be painstaking and generous', tags: ['motion to dismiss'] },
  { case_id: 'cl:2381317', text: 'the competent evidential materials presented, when viewed in the light most favorable to the non-moving party, are sufficient to permit a rational factfinder to resolve the alleged disputed issue in favor of the non-moving party', proposition: 'The Brill summary judgment standard', tags: ['summary judgment', 'R. 4:46-2'] },
  { case_id: 'cl:2381317', text: 'a non-moving party cannot defeat a motion for summary judgment merely by pointing to any fact in dispute', proposition: 'A disputed fact must be material and genuine', tags: ['summary judgment'] },
  { case_id: 'cl:2381317', text: 'the trial court should not hesitate to grant summary judgment', proposition: 'When the evidence is one-sided, summary judgment should be granted', tags: ['summary judgment'] },
  { case_id: 'cl:9885187', text: 'a discriminating search of the merits in the pleadings, depositions and admissions on file, together with the affidavits submitted on the motion', proposition: 'Summary judgment requires a discriminating search of the record', tags: ['summary judgment'] },
];
