CREATE TABLE IF NOT EXISTS stg_growth_pressure_lga_2036 (
  lga_code_2021 CHAR(8) NOT NULL,
  lga_name_2021 VARCHAR(120) NOT NULL,
  reference_start_year SMALLINT UNSIGNED NOT NULL,
  reference_end_year SMALLINT UNSIGNED NOT NULL,
  vif_population_growth_2021_2036_pct DECIMAL(8, 1) NOT NULL,
  vif_dwelling_growth_2021_2036_pct DECIMAL(8, 1) NOT NULL,
  growth_pressure_indicator DECIMAL(8, 1) NOT NULL,
  source_file VARCHAR(255) NOT NULL,
  loaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lga_code_2021),
  KEY idx_growth_pressure_lga_name (lga_name_2021),
  CONSTRAINT chk_growth_pressure_period CHECK (reference_start_year = 2021 AND reference_end_year = 2036)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
