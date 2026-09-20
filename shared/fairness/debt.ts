/**
 * The Fairness Lint's recorded debt (Stage 173): every violation the full lint reports today,
 * written down so that a new one cannot hide among them.
 *
 * This file is NOT a list of things that are fine. Every line is a build that moves a weapon's
 * time-to-kill further than the ledger's ±4% promise allows, and every one is a balance decision
 * waiting to be made. Delete a line when the build stops violating; the lint reports cleared
 * entries on every run and never fails for one.
 *
 * Regenerate with `npm run lint:fairness -- --record`. The diff is the thing to review.
 */
import type { DebtEntry } from "./lint";

export const FAIRNESS_DEBT: readonly DebtEntry[] = [
  {
    "key": "solo:long_lease|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.044117647058823595,
    "detail": "[solo:long_lease] ttk-deviation: stack_smg @25 m offense -4.4% (1.083 vs 1.133 s)"
  },
  {
    "key": "solo:long_lease|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.06730769230769229,
    "detail": "[solo:long_lease] ttk-deviation: stack_smg @40 m offense -6.7% (1.617 vs 1.733 s)"
  },
  {
    "key": "solo:hair_trigger|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.1923076923076923,
    "detail": "[solo:hair_trigger] ttk-deviation: stack_smg @40 m offense 19.2% (2.067 vs 1.733 s)"
  },
  {
    "key": "solo:repo_grip|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[solo:repo_grip] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "solo:repo_grip|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[solo:repo_grip] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "solo:arrears|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[solo:arrears] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "solo:arrears|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[solo:arrears] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "solo:haircut|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[solo:haircut] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "solo:haircut|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[solo:haircut] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "solo:stop_loss|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[solo:stop_loss] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "solo:stop_loss|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.06730769230769229,
    "detail": "[solo:stop_loss] ttk-deviation: stack_smg @40 m offense -6.7% (1.617 vs 1.733 s)"
  },
  {
    "key": "pair:repo_grip+static_skin|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:repo_grip+static_skin] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:repo_grip+static_skin|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:repo_grip+static_skin] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:contagion_rider+long_lease|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.044117647058823595,
    "detail": "[pair:contagion_rider+long_lease] ttk-deviation: stack_smg @25 m offense -4.4% (1.083 vs 1.133 s)"
  },
  {
    "key": "pair:contagion_rider+long_lease|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.06730769230769229,
    "detail": "[pair:contagion_rider+long_lease] ttk-deviation: stack_smg @40 m offense -6.7% (1.617 vs 1.733 s)"
  },
  {
    "key": "pair:long_lease+quiet_ledger|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.044117647058823595,
    "detail": "[pair:long_lease+quiet_ledger] ttk-deviation: stack_smg @25 m offense -4.4% (1.083 vs 1.133 s)"
  },
  {
    "key": "pair:long_lease+quiet_ledger|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.06730769230769229,
    "detail": "[pair:long_lease+quiet_ledger] ttk-deviation: stack_smg @40 m offense -6.7% (1.617 vs 1.733 s)"
  },
  {
    "key": "pair:arrears+spite_clause|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:arrears+spite_clause] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:arrears+spite_clause|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:arrears+spite_clause] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:collateral+hair_trigger|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.1923076923076923,
    "detail": "[pair:collateral+hair_trigger] ttk-deviation: stack_smg @40 m offense 19.2% (2.067 vs 1.733 s)"
  },
  {
    "key": "pair:cold_file+hair_trigger|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.1923076923076923,
    "detail": "[pair:cold_file+hair_trigger] ttk-deviation: stack_smg @40 m offense 19.2% (2.067 vs 1.733 s)"
  },
  {
    "key": "pair:hair_trigger+short_squeeze|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.3076923076923077,
    "detail": "[pair:hair_trigger+short_squeeze] ttk-deviation: stack_smg @40 m offense 30.8% (2.267 vs 1.733 s)"
  },
  {
    "key": "pair:hair_trigger+red_ink|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.1923076923076923,
    "detail": "[pair:hair_trigger+red_ink] ttk-deviation: stack_smg @40 m offense 19.2% (2.067 vs 1.733 s)"
  },
  {
    "key": "pair:repo_grip+wake_lung|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:repo_grip+wake_lung] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:repo_grip+wake_lung|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:repo_grip+wake_lung] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:lease_lapse+repo_grip|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:lease_lapse+repo_grip] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:lease_lapse+repo_grip|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:lease_lapse+repo_grip] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:counterparty+repo_grip|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:counterparty+repo_grip] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:arrears+burn_notice|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:arrears+burn_notice] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:arrears+burn_notice|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:arrears+burn_notice] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:arrears+double_entry|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:arrears+double_entry] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:arrears+double_entry|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:arrears+double_entry] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:arrears+black_swan|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:arrears+black_swan] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:arrears+black_swan|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:arrears+black_swan] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:double_entry+haircut|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:double_entry+haircut] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:double_entry+haircut|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:double_entry+haircut] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:default_swap+hollow_point|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.11764705882352944,
    "detail": "[pair:default_swap+hollow_point] ttk-deviation: stack_smg @25 m offense 11.8% (1.267 vs 1.133 s)"
  },
  {
    "key": "pair:default_swap+hollow_point|ttk-deviation|clockeater|25|offense",
    "magnitude": 0.3018867924528301,
    "detail": "[pair:default_swap+hollow_point] ttk-deviation: clockeater @25 m offense 30.2% (1.150 vs 0.883 s)"
  },
  {
    "key": "pair:black_swan+haircut|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:black_swan+haircut] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:black_swan+haircut|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:black_swan+haircut] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:circuit_breaker+haircut|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:circuit_breaker+haircut] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:circuit_breaker+haircut|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[pair:circuit_breaker+haircut] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "pair:circuit_breaker+stop_loss|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:circuit_breaker+stop_loss] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:circuit_breaker+stop_loss|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.06730769230769229,
    "detail": "[pair:circuit_breaker+stop_loss] ttk-deviation: stack_smg @40 m offense -6.7% (1.617 vs 1.733 s)"
  },
  {
    "key": "pair:leverage+stop_loss|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[pair:leverage+stop_loss] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "pair:leverage+stop_loss|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.06730769230769229,
    "detail": "[pair:leverage+stop_loss] ttk-deviation: stack_smg @40 m offense -6.7% (1.617 vs 1.733 s)"
  },
  {
    "key": "pair:default_swap+wash_trade|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.1923076923076923,
    "detail": "[pair:default_swap+wash_trade] ttk-deviation: stack_smg @40 m offense 19.2% (2.067 vs 1.733 s)"
  },
  {
    "key": "grow:slipfile|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:slipfile] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:slipfile|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:slipfile] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:static_skin|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:static_skin] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:static_skin|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:static_skin] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:curb_weight|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:curb_weight] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:curb_weight|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:curb_weight] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:contagion_rider|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.044117647058823595,
    "detail": "[grow:contagion_rider] ttk-deviation: stack_smg @25 m offense -4.4% (1.083 vs 1.133 s)"
  },
  {
    "key": "grow:contagion_rider|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.06730769230769229,
    "detail": "[grow:contagion_rider] ttk-deviation: stack_smg @40 m offense -6.7% (1.617 vs 1.733 s)"
  },
  {
    "key": "grow:spite_clause|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:spite_clause] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:spite_clause|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:spite_clause] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:hair_trigger|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.3076923076923077,
    "detail": "[grow:hair_trigger] ttk-deviation: stack_smg @40 m offense 30.8% (2.267 vs 1.733 s)"
  },
  {
    "key": "grow:cold_file|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.3076923076923077,
    "detail": "[grow:cold_file] ttk-deviation: stack_smg @40 m offense 30.8% (2.267 vs 1.733 s)"
  },
  {
    "key": "grow:wake_lung|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:wake_lung] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:wake_lung|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:wake_lung] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:repo_grip|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:repo_grip] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:lease_lapse|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:lease_lapse] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:lease_lapse|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:lease_lapse] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:burn_notice|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:burn_notice] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:burn_notice|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:burn_notice] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:arrears|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:arrears] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:arrears|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:arrears] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:double_entry|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:double_entry] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:double_entry|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:double_entry] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:short_squeeze|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.20192307692307687,
    "detail": "[grow:short_squeeze] ttk-deviation: stack_smg @40 m offense 20.2% (2.083 vs 1.733 s)"
  },
  {
    "key": "grow:wire_fraud|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.3076923076923077,
    "detail": "[grow:wire_fraud] ttk-deviation: stack_smg @40 m offense 30.8% (2.267 vs 1.733 s)"
  },
  {
    "key": "grow:bad_paper|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.15384615384615374,
    "detail": "[grow:bad_paper] ttk-deviation: stack_smg @40 m offense 15.4% (2.000 vs 1.733 s)"
  },
  {
    "key": "grow:meltdown_clause|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.11764705882352944,
    "detail": "[grow:meltdown_clause] ttk-deviation: stack_smg @25 m offense 11.8% (1.267 vs 1.133 s)"
  },
  {
    "key": "grow:meltdown_clause|ttk-deviation|clockeater|25|offense",
    "magnitude": 0.3018867924528301,
    "detail": "[grow:meltdown_clause] ttk-deviation: clockeater @25 m offense 30.2% (1.150 vs 0.883 s)"
  },
  {
    "key": "grow:acceleration|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:acceleration] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:counterparty|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:counterparty] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:capital_flight|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.23076923076923062,
    "detail": "[grow:capital_flight] ttk-deviation: stack_smg @40 m offense 23.1% (2.133 vs 1.733 s)"
  },
  {
    "key": "grow:liquidation|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.07692307692307687,
    "detail": "[grow:liquidation] ttk-deviation: stack_smg @40 m offense -7.7% (1.600 vs 1.733 s)"
  },
  {
    "key": "grow:black_swan|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:black_swan] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:black_swan|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.23076923076923084,
    "detail": "[grow:black_swan] ttk-deviation: stack_smg @40 m offense -23.1% (1.333 vs 1.733 s)"
  },
  {
    "key": "grow:haircut|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.05882352941176472,
    "detail": "[grow:haircut] ttk-deviation: stack_smg @25 m offense -5.9% (1.067 vs 1.133 s)"
  },
  {
    "key": "grow:haircut|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.23076923076923084,
    "detail": "[grow:haircut] ttk-deviation: stack_smg @40 m offense -23.1% (1.333 vs 1.733 s)"
  },
  {
    "key": "grow:circuit_breaker|ttk-deviation|stack_smg|15|offense",
    "magnitude": 0.08333333333333348,
    "detail": "[grow:circuit_breaker] ttk-deviation: stack_smg @15 m offense -8.3% (0.733 vs 0.800 s)"
  },
  {
    "key": "grow:stop_loss|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.20192307692307687,
    "detail": "[grow:stop_loss] ttk-deviation: stack_smg @40 m offense 20.2% (2.083 vs 1.733 s)"
  },
  {
    "key": "grow:wash_trade|ttk-deviation|stack_smg|25|offense",
    "magnitude": 0.17647058823529416,
    "detail": "[grow:wash_trade] ttk-deviation: stack_smg @25 m offense 17.6% (1.333 vs 1.133 s)"
  },
  {
    "key": "grow:wash_trade|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.1923076923076923,
    "detail": "[grow:wash_trade] ttk-deviation: stack_smg @40 m offense 19.2% (2.067 vs 1.733 s)"
  },
  {
    "key": "grow:wash_trade|ttk-deviation|clockeater|25|offense",
    "magnitude": 0.3018867924528301,
    "detail": "[grow:wash_trade] ttk-deviation: clockeater @25 m offense 30.2% (1.150 vs 0.883 s)"
  },
  {
    "key": "grow:default_swap|ttk-deviation|stack_smg|40|offense",
    "magnitude": 0.1923076923076923,
    "detail": "[grow:default_swap] ttk-deviation: stack_smg @40 m offense 19.2% (2.067 vs 1.733 s)"
  }
];
