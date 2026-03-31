#!/usr/bin/env node
/**
 * Space Mission Feasibility Simulator — CLI
 *
 * Usage:
 *   npx tsx src/space-mission-simulator/cli.ts [options]
 *
 * Flags:
 *   --name              Mission name (default: "Unnamed Mission")
 *   --distance          Target distance in light-years (default: 4.37 — Alpha Centauri)
 *   --mass              Probe payload mass in kg (default: 5000)
 *   --diameter          Probe diameter in m (default: 20)
 *   --integrity         Structural integrity rating in g (default: 15)
 *   --sail-diameter     Sail diameter in m (default: 200)
 *   --laser-power       Laser array power in GW (default: 50)
 *   --cruise-velocity   Cruise velocity as fraction of c (default: 0.05)
 *   --magsail-diameter  Magnetic sail loop diameter in km (default: 100)
 *   --solar-power       Available solar power at destination in GW (default: 2)
 *   --metals            Structural metal mass at destination in kg (default: 5e18)
 *   --semiconductors    Semiconductor feedstock at destination in kg (default: 1e12)
 *   --particle-flux     Particle flux at destination in particles/cm²/s (default: 4)
 *   --ism-density       ISM density in protons/cm³ (default: 1.0)
 *   --annual-dose       Annual radiation dose in rad/yr (default: 100)
 *   --peak-flux         Peak solar event flux in particles/cm²/s (default: 1e6)
 *   --origin-power      Available laser power at origin in GW (default: 60)
 *   --json              Output raw JSON instead of human-readable text
 *   --help              Show this help message
 *
 * Examples:
 *   npx tsx src/space-mission-simulator/cli.ts
 *   npx tsx src/space-mission-simulator/cli.ts --distance 4.37 --laser-power 100
 *   npx tsx src/space-mission-simulator/cli.ts --json
 */

import { simulate } from "./feasibility-simulator.js";
import type { MissionProfile } from "./types.js";
import { FeasibilityVerdict } from "./types.js";

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

function num(args: Record<string, string>, key: string, fallback: number): number {
  const v = args[key];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (isNaN(n)) {
    process.stderr.write(`Invalid numeric value for --${key}: ${v}\n`);
    process.exit(1);
  }
  return n;
}

// ── Help ──────────────────────────────────────────────────────────────────────

const HELP = `
Space Mission Feasibility Simulator
====================================

Usage: npx tsx src/space-mission-simulator/cli.ts [options]

Options:
  --name              Mission name (default: "Unnamed Mission")
  --distance          Target distance in light-years (default: 4.37)
  --mass              Probe mass in kg (default: 5000)
  --diameter          Probe diameter in m (default: 20)
  --integrity         Structural integrity in g (default: 15)
  --sail-diameter     Sail diameter in m (default: 200)
  --laser-power       Laser power in GW (default: 50)
  --cruise-velocity   Cruise velocity fraction of c (default: 0.05)
  --magsail-diameter  Magsail loop diameter in km (default: 100)
  --solar-power       Destination solar power in GW (default: 2)
  --metals            Structural metals at destination in kg (default: 5e18)
  --semiconductors    Semiconductors at destination in kg (default: 1e12)
  --particle-flux     Particle flux in particles/cm²/s (default: 4)
  --ism-density       ISM density in protons/cm³ (default: 1.0)
  --annual-dose       Annual radiation dose in rad/yr (default: 100)
  --peak-flux         Peak solar event flux in particles/cm²/s (default: 1e6)
  --origin-power      Origin laser power budget in GW (default: 60)
  --json              Emit JSON output
  --help              Show this message
`.trim();

// ── Human-readable formatter ──────────────────────────────────────────────────

function verdictLabel(v: FeasibilityVerdict): string {
  switch (v) {
    case FeasibilityVerdict.FEASIBLE:   return "✅  FEASIBLE";
    case FeasibilityVerdict.MARGINAL:   return "⚠️   MARGINAL";
    case FeasibilityVerdict.INFEASIBLE: return "❌  INFEASIBLE";
  }
}

function formatReport(report: ReturnType<typeof simulate>): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push(`  Space Mission Feasibility Report`);
  lines.push(`  Mission: ${report.missionName}`);
  lines.push(`  Verdict: ${verdictLabel(report.verdict)}`);
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  // Blockers
  if (report.blockers.length > 0) {
    lines.push("BLOCKERS:");
    for (const b of report.blockers) lines.push(`  ✗ ${b}`);
    lines.push("");
  }

  // Warnings
  if (report.warnings.length > 0) {
    lines.push("WARNINGS:");
    for (const w of report.warnings) lines.push(`  ⚠ ${w}`);
    lines.push("");
  }

  // Propulsion
  lines.push("── Propulsion ─────────────────────────────────────────────────");
  const p = report.propulsion;
  lines.push(`  Envelope valid:        ${p.envelopeValid ? "yes" : "no"}`);
  lines.push(`  Cruise velocity:       ${(p.achievedCruiseVelocity_c * 100).toFixed(2)}% c`);
  lines.push(`  Transit duration:      ${p.transitDuration_years.toFixed(1)} years`);
  lines.push(`  Transit within limit:  ${p.transitWithinLimit ? "yes" : "no"} (max 200 yr)`);
  lines.push(`  Max deceleration:      ${p.maxDecelerationG.toExponential(2)} g`);
  lines.push(`  Nuclear backup:        ${p.nuclearBackupRequired ? "required" : "not required"}`);
  lines.push(`  Replication feasible:  ${p.replicationFeasible ? "yes" : "no"}`);
  if (p.envelopeErrors.length > 0) {
    for (const e of p.envelopeErrors) lines.push(`    ! ${e}`);
  }
  lines.push("");

  // Colony
  lines.push("── Colony Seeding ─────────────────────────────────────────────");
  const c = report.colony;
  lines.push(`  Viability score:       ${(c.viabilityScore * 100).toFixed(0)}%`);
  lines.push(`  Decision:              ${c.decision}`);
  lines.push(`  Energy requirement:    ${c.meetsEnergyRequirement ? "met" : "not met"}`);
  lines.push(`  Resource requirement:  ${c.meetsResourceRequirement ? "met" : "not met"}`);
  lines.push(`  Radiation tolerance:   ${c.withinRadiationTolerance ? "within limits" : "exceeded"}`);
  lines.push(`  Orbital stability:     ${c.hasStableOrbit ? "stable" : "unstable"}`);
  lines.push("");

  // Energy
  lines.push("── Origin Energy ──────────────────────────────────────────────");
  const e = report.energy;
  lines.push(`  Laser array affordable: ${e.laserArrayAffordable ? "yes" : "no"}`);
  lines.push(`  Fail-safe reserves:     ${e.failSafeReservesMaintained ? "active" : "inactive"}`);
  lines.push(`  Power balance:          ${(e.originPowerBalance_W / 1e9).toFixed(1)} GW surplus`);
  lines.push("");

  // Radiation
  lines.push("── Radiation Hardening ────────────────────────────────────────");
  const r = report.radiation;
  lines.push(`  Transit TID:           ${r.estimatedTransitTID_rad.toExponential(2)} rad`);
  lines.push(`  Substrate tolerance:   ${r.withinSubstrateTolerance ? "within SiC limit (10 Mrad)" : "EXCEEDED"}`);
  lines.push(`  Performance at arrival:${(r.estimatedPerformanceFraction * 100).toFixed(1)}%`);
  lines.push(`  TMR BER sufficient:    ${r.tmrSufficient ? "yes" : "no"}`);
  lines.push("");

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args["help"] === "true") {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  const solarPowerGW = num(args, "solar-power", 2);
  const laserPowerGW = num(args, "laser-power", 50);
  const originPowerGW = num(args, "origin-power", 60);

  const profile: MissionProfile = {
    name: args["name"] ?? "Unnamed Mission",
    probe: {
      mass_kg: num(args, "mass", 5000),
      diameter_m: num(args, "diameter", 20),
      structuralIntegrityRating_g: num(args, "integrity", 15),
    },
    propulsion: {
      sailDiameter_m: num(args, "sail-diameter", 200),
      laserArrayPower_W: laserPowerGW * 1e9,
      targetCruiseVelocity_c: num(args, "cruise-velocity", 0.05),
      magsailLoopDiameter_km: num(args, "magsail-diameter", 100),
    },
    destination: {
      distance_ly: num(args, "distance", 4.37),
      solarPower_w: solarPowerGW * 1e9,
      meetsMinimumEnergyThreshold: solarPowerGW >= 1,
      structuralMetals_kg: num(args, "metals", 5e18),
      semiconductors_kg: num(args, "semiconductors", 1e12),
      particleFlux_per_cm2_s: num(args, "particle-flux", 4),
      withinHardenedTolerance: num(args, "particle-flux", 4) < 1e8,
      orbitalStability_Myr: 500,
      availableElements: ["Si", "Al", "Y", "Ba", "Cu", "O", "H"],
    },
    originEnergy: {
      availableLaserPower_W: originPowerGW * 1e9,
      failSafeReservesActive: true,
    },
    ismConditions: {
      density_protons_per_cm3: num(args, "ism-density", 1.0),
    },
    radiation: {
      annualDose_rad_per_year: num(args, "annual-dose", 100),
      peakFlux_particles_per_cm2_s: num(args, "peak-flux", 1e6),
    },
  };

  const report = simulate(profile);

  if (args["json"] === "true") {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatReport(report) + "\n");
  }

  // Exit with non-zero code if infeasible so CLI can be used in scripts
  if (report.verdict === FeasibilityVerdict.INFEASIBLE) {
    process.exit(1);
  }
}

main();
