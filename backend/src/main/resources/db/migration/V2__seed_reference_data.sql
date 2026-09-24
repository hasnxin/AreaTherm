-- =====================================================================
-- Seed data for the two global reference catalogs (materials, predefined
-- locations) -- mirrors app/js/data.js exactly (see ARCHITECTURE.md SS6:
-- "js/data.js ... -> seed data / Flyway"). comfort_profile is NOT seeded
-- here -- it's project-scoped (created per-project via the API), not a
-- global catalog.
-- =====================================================================

-- ---- Materials (app/js/data.js MATERIALS) -----------------------------
-- cost_estimate_inr_per_unit is per-m2 for WALL/ROOF/INSULATION/WINDOW,
-- per-kg for THERMAL_MASS (matches data.js's costPerM2/costPerKg split).

-- WALL
INSERT INTO material (slug, category, name, density_kg_m3, thermal_conductivity_w_mk, specific_heat_j_kgk, default_thickness_mm, solar_absorptivity, solar_reflectivity, emissivity, cost_estimate_inr_per_unit, sustainability_indicator) VALUES
('wall_concrete', 'WALL', 'Concrete (dense)', 2400, 1.40, 880, 200, 0.65, 0.35, 0.90, 1400, 'LOW'),
('wall_brick', 'WALL', 'Fired Brick', 1700, 0.72, 840, 230, 0.60, 0.40, 0.90, 1100, 'MEDIUM'),
('wall_stone', 'WALL', 'Local Stone Masonry', 2600, 1.70, 850, 400, 0.55, 0.45, 0.90, 1600, 'MEDIUM'),
('wall_adobe', 'WALL', 'Adobe', 1600, 0.55, 900, 300, 0.60, 0.40, 0.90, 650, 'HIGH'),
('wall_rammed_earth', 'WALL', 'Rammed Earth', 2000, 0.60, 900, 350, 0.60, 0.40, 0.90, 900, 'HIGH'),
('wall_mud_block', 'WALL', 'Sun-dried Mud Block', 1500, 0.46, 900, 300, 0.62, 0.38, 0.90, 500, 'HIGH'),
('wall_aac', 'WALL', 'AAC Block', 550, 0.16, 1050, 200, 0.55, 0.45, 0.90, 950, 'MEDIUM'),
('wall_insulated_panel', 'WALL', 'Insulated Sandwich Panel (PUF core)', 45, 0.023, 1400, 100, 0.45, 0.55, 0.85, 1900, 'MEDIUM'),
('wall_composite', 'WALL', 'Composite Insulated Wall (brick + EPS + brick)', 900, 0.09, 950, 280, 0.55, 0.45, 0.90, 2100, 'MEDIUM');

-- ROOF
INSERT INTO material (slug, category, name, density_kg_m3, thermal_conductivity_w_mk, specific_heat_j_kgk, default_thickness_mm, solar_absorptivity, solar_reflectivity, emissivity, cost_estimate_inr_per_unit, sustainability_indicator) VALUES
('roof_rcc', 'ROOF', 'RCC Slab', 2400, 1.58, 880, 150, 0.65, 0.35, 0.90, 1500, 'LOW'),
('roof_metal', 'ROOF', 'Galvanized Metal Sheet', 7850, 50, 490, 1, 0.55, 0.45, 0.28, 700, 'MEDIUM'),
('roof_insulated_metal', 'ROOF', 'Insulated Metal Roof Panel (PUF core)', 40, 0.022, 1400, 80, 0.45, 0.55, 0.30, 1700, 'MEDIUM'),
('roof_composite', 'ROOF', 'Composite Roof (metal + rockwool + ply)', 300, 0.05, 1000, 120, 0.50, 0.50, 0.75, 1600, 'MEDIUM'),
('roof_earth', 'ROOF', 'Traditional Earth Roof', 1700, 0.80, 900, 250, 0.65, 0.35, 0.90, 850, 'HIGH');

-- INSULATION
INSERT INTO material (slug, category, name, density_kg_m3, thermal_conductivity_w_mk, specific_heat_j_kgk, default_thickness_mm, solar_absorptivity, solar_reflectivity, emissivity, cost_estimate_inr_per_unit, sustainability_indicator) VALUES
('ins_eps', 'INSULATION', 'EPS', 20, 0.035, 1450, 75, 0.4, 0.6, 0.6, 500, 'LOW'),
('ins_xps', 'INSULATION', 'XPS', 35, 0.030, 1450, 75, 0.4, 0.6, 0.6, 650, 'LOW'),
('ins_rockwool', 'INSULATION', 'Rock Wool', 100, 0.040, 840, 75, 0.4, 0.6, 0.6, 600, 'MEDIUM'),
('ins_glasswool', 'INSULATION', 'Glass Wool', 24, 0.038, 840, 75, 0.4, 0.6, 0.6, 550, 'MEDIUM'),
('ins_puf', 'INSULATION', 'PUF (Polyurethane Foam)', 32, 0.023, 1400, 75, 0.4, 0.6, 0.6, 750, 'LOW'),
('ins_sheepwool', 'INSULATION', 'Sheep Wool', 25, 0.038, 1700, 75, 0.4, 0.6, 0.6, 900, 'HIGH'),
('ins_natural_fibre', 'INSULATION', 'Natural Fibre Insulation (local wool/felt)', 60, 0.045, 1600, 75, 0.4, 0.6, 0.6, 700, 'HIGH');

-- THERMAL MASS (cost_estimate_inr_per_unit is per-kg here)
INSERT INTO material (slug, category, name, density_kg_m3, thermal_conductivity_w_mk, specific_heat_j_kgk, solar_absorptivity, solar_reflectivity, emissivity, pcm_melt_temp_c, pcm_latent_heat_j_kg, cost_estimate_inr_per_unit, sustainability_indicator) VALUES
('mass_stone', 'THERMAL_MASS', 'Stone (basalt/granite)', 2700, 2.2, 850, 0.6, 0.4, 0.9, NULL, NULL, 6, 'MEDIUM'),
('mass_concrete', 'THERMAL_MASS', 'Concrete Mass', 2400, 1.4, 880, 0.6, 0.4, 0.9, NULL, NULL, 5, 'LOW'),
('mass_water', 'THERMAL_MASS', 'Water Drums', 1000, 0.6, 4186, 0.9, 0.1, 0.95, NULL, NULL, 0.05, 'HIGH'),
('mass_pcm', 'THERMAL_MASS', 'Phase Change Material (paraffin-based, ~24C melt)', 900, 0.2, 2100, 0.5, 0.5, 0.9, 24, 190000, 350, 'MEDIUM'),
('mass_earth', 'THERMAL_MASS', 'Compacted Earth Mass', 1900, 1.0, 900, 0.6, 0.4, 0.9, NULL, NULL, 1, 'HIGH'),
('mass_composite', 'THERMAL_MASS', 'Composite Storage (stone + PCM)', 1800, 1.1, 1400, 0.55, 0.45, 0.9, 24, 90000, 120, 'MEDIUM');

-- WINDOW / GLAZING (u_value_w_m2k + shgc, no density/k/cp/absorptivity)
INSERT INTO material (slug, category, name, u_value_w_m2k, shgc, cost_estimate_inr_per_unit, sustainability_indicator) VALUES
('glaze_single', 'WINDOW', 'Single Glazing', 5.8, 0.85, 1200, 'LOW'),
('glaze_double', 'WINDOW', 'Double Glazing', 2.8, 0.70, 3200, 'MEDIUM'),
('glaze_triple', 'WINDOW', 'Triple Glazing', 1.6, 0.58, 5200, 'MEDIUM'),
('glaze_lowe', 'WINDOW', 'Low-E Double Glazing', 1.8, 0.62, 4200, 'HIGH');

-- ---- Predefined locations (app/js/data.js PREDEFINED_LOCATIONS) --------
-- soilSurface data is deliberately not carried over -- informational-only
-- in the frontend, never fed into the physics engine (see ARCHITECTURE.md
-- SS8 / engine.js floorUValue's comment).
INSERT INTO predefined_location (slug, name, latitude, longitude, elevation_m, region, category, has_illustrative_profile) VALUES
('leh', 'Leh, Ladakh', 34.15, 77.58, 3500, 'Ladakh (UT)', 'Cold desert', FALSE),
('kargil', 'Kargil, Ladakh', 34.55, 76.13, 2676, 'Ladakh (UT)', 'Cold desert', FALSE),
('keylong', 'Keylong, Himachal Pradesh', 32.57, 77.03, 3080, 'Himachal Pradesh', 'High Himalaya', FALSE),
('munsiyari', 'Munsiyari, Uttarakhand', 30.07, 80.24, 2298, 'Uttarakhand', 'High Himalaya', FALSE),
('dras', 'Drass, Ladakh', 34.43, 75.75, 3280, 'Ladakh (UT)', 'Cold desert', FALSE),
('srinagar', 'Srinagar, J&K', 34.08, 74.80, 1590, 'Jammu & Kashmir (UT)', 'Temperate valley', FALSE),
('pune', 'Pune, Maharashtra', 18.52, 73.88, 560, 'Maharashtra', 'Tropical plateau', FALSE),
('bareilly', 'Bareilly, Uttar Pradesh', 28.37, 79.43, 168, 'Uttar Pradesh', 'Gangetic plain', FALSE),
('nagpur', 'Nagpur, Maharashtra', 21.15, 79.09, 310, 'Maharashtra', 'Tropical plain', FALSE),
('shimla', 'Shimla, Himachal Pradesh', 31.10, 77.17, 2200, 'Himachal Pradesh', 'Mid Himalaya', FALSE);
