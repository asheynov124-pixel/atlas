/**
 * Daily aggregates. The building pass accumulates into `Simulation.acc`; at day end the buffers swap and
 * `derive()` turns raw sums into the labour market (education-aware job filling), unemployment, customer
 * factor and averages that the next day reads. Allocation-free reset.
 */
import { WORKFORCE_RATIO } from './params';

export class Agg {
  population = 0;
  housingCap = 0;
  pipelineHousing = 0;
  /** residents by education tier: basic / educated / graduates */
  eduRes = new Float64Array(3);
  /** job slots per family index (0 unused · 1 C · 2 I · 3 O · 4 ploppables) */
  jobs = new Float64Array(5);
  jobsE1 = new Float64Array(5);
  jobsE2 = new Float64Array(5);
  pipelineJobs = new Float64Array(5);
  workers = new Float64Array(5);
  happySum = 0;
  happyW = 0;
  healthSum = 0;
  healthW = 0;
  eduSum = 0;
  eduW = 0;
  buildings = 0;
  growables = 0;
  abandoned = 0;
  constructing = 0;
  parks = 0;
  landmarks = 0;
  wonders = 0;
  custom = 0;
  zoneBuildings = new Int32Array(12);
  visitors = 0;
  research = 0;
  problems = new Int32Array(32);
  problemTile = new Int32Array(32).fill(-1);
  distPop = new Float64Array(256);
  distJobs = new Float64Array(256);
  distBld = new Float64Array(256);
  distHappy = new Float64Array(256);
  distHappyW = new Float64Array(256);

  // ── derived
  workforce = 0;
  workforceSkilled = 0;
  employed = 0;
  unemployment = 0;
  /** unemployment as felt by citizens: muted while the town is tiny (pioneers don't mind) */
  unemploymentFelt = 0;
  jobsTotal = 0;
  pipelineJobsTotal = 0;
  openJobs = 0;
  happiness = 50;
  health = 50;
  education = 0;
  skillFill = 1;
  workerEdu = 0;

  reset(): void {
    this.population = this.housingCap = this.pipelineHousing = 0;
    this.eduRes.fill(0);
    this.jobs.fill(0);
    this.jobsE1.fill(0);
    this.jobsE2.fill(0);
    this.pipelineJobs.fill(0);
    this.workers.fill(0);
    this.happySum = this.happyW = this.healthSum = this.healthW = this.eduSum = this.eduW = 0;
    this.buildings = this.growables = this.abandoned = this.constructing = 0;
    this.parks = this.landmarks = this.wonders = this.custom = 0;
    this.zoneBuildings.fill(0);
    this.visitors = this.research = 0;
    this.problems.fill(0);
    this.problemTile.fill(-1);
    this.distPop.fill(0);
    this.distJobs.fill(0);
    this.distBld.fill(0);
    this.distHappy.fill(0);
    this.distHappyW.fill(0);
  }

  /**
   * Labour market: skilled jobs (needing educated / graduate workers) are filled first from educated
   * residents; everyone left over competes for the remaining jobs. Writes per-family fill ratios into `fill`.
   */
  derive(workforceMul: number, fill: Float32Array): void {
    const ratio = WORKFORCE_RATIO * workforceMul;
    const w0 = this.eduRes[0] * ratio, w1 = this.eduRes[1] * ratio, w2 = this.eduRes[2] * ratio;
    this.workforce = w0 + w1 + w2;
    this.workforceSkilled = w1 + w2;
    let jobsTotal = 0, skilledJobs = 0;
    for (let k = 1; k < 5; k++) {
      jobsTotal += this.jobs[k];
      skilledJobs += Math.min(this.jobs[k], this.jobsE1[k] + this.jobsE2[k]);
    }
    this.jobsTotal = jobsTotal;
    let pj = 0;
    for (let k = 1; k < 5; k++) pj += this.pipelineJobs[k];
    this.pipelineJobsTotal = pj;
    const skilledAvail = w1 + w2;
    const skilledFilled = Math.min(skilledAvail, skilledJobs);
    const unskJobs = jobsTotal - skilledJobs;
    const unskAvail = w0 + (skilledAvail - skilledFilled);
    const unskFilled = Math.min(unskAvail, unskJobs);
    // leftover basic workers fill up to 60 % of the remaining skilled posts as trainees
    const trainees = Math.min(unskAvail - unskFilled, (skilledJobs - skilledFilled) * 0.6);
    const skillRatio = skilledJobs > 0 ? (skilledFilled + trainees) / skilledJobs : 1;
    const unskRatio = unskJobs > 0 ? unskFilled / unskJobs : 1;
    for (let k = 1; k < 5; k++) {
      const j = this.jobs[k];
      if (j <= 0) {
        fill[k] = 1;
        continue;
      }
      const sk = Math.min(j, this.jobsE1[k] + this.jobsE2[k]);
      fill[k] = (sk * skillRatio + (j - sk) * unskRatio) / j;
    }
    fill[0] = 1;
    this.employed = skilledFilled + unskFilled + trainees;
    this.unemployment = this.workforce > 0 ? Math.max(0, this.workforce - this.employed) / this.workforce : 0;
    this.unemploymentFelt = this.unemployment * Math.min(1, this.workforce / 220);
    this.openJobs = Math.max(0, jobsTotal - this.employed);
    this.skillFill = skilledJobs > 0 ? skilledFilled / skilledJobs : 1;
    this.workerEdu = this.employed > 0 ? (skilledFilled * (1 + w2 / Math.max(1, w1 + w2)) + unskFilled * 0.2) / this.employed : 0;
    this.happiness = this.happyW > 0 ? this.happySum / this.happyW : 50;
    this.health = this.healthW > 0 ? this.healthSum / this.healthW : 50;
    this.education = this.eduW > 0 ? this.eduSum / this.eduW : 0;
  }
}
