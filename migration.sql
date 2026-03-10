-- ============================================================
-- AgriPay: Milestone Section Overhaul - Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add image_url to cycle_milestones (for Milestones Achieved section)
ALTER TABLE cycle_milestones ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ============================================================
-- 2. Growth Stage Inputs table (for Farmer Input section)
-- ============================================================
CREATE TABLE IF NOT EXISTS growth_stage_inputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_cycle_id UUID REFERENCES crop_cycles(id) ON DELETE CASCADE NOT NULL,
  stage_name TEXT NOT NULL,            -- e.g. 'sowing', 'tillering'
  stage_date DATE,                     -- date farmer fills in per stage
  das INTEGER,                         -- days after sowing
  irrigation BOOLEAN DEFAULT FALSE,
  fertilizer_per_acre NUMERIC(10, 2),  -- kg or units per acre
  herbicide BOOLEAN DEFAULT FALSE,
  pesticide BOOLEAN DEFAULT FALSE,
  fungicide BOOLEAN DEFAULT FALSE,
  biologicals BOOLEAN DEFAULT FALSE,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(crop_cycle_id, stage_name)    -- one record per stage per cycle
);

-- RLS
ALTER TABLE growth_stage_inputs ENABLE ROW LEVEL SECURITY;

-- Farmers can manage inputs for their own farms
CREATE POLICY "Farmers can manage own stage inputs"
  ON growth_stage_inputs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crop_cycles cc
      JOIN farms f ON f.id = cc.farm_id
      WHERE cc.id = growth_stage_inputs.crop_cycle_id
        AND f.user_id = auth.uid()
    )
  );

-- Admins can read all stage inputs
CREATE POLICY "Admins can view all stage inputs"
  ON growth_stage_inputs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================
-- 3. Seed milestone_templates for wheat (3 payable milestones)
--    Only inserts if not already present
-- ============================================================
DO $$
DECLARE
  wheat_crop_id INTEGER;
BEGIN
  SELECT id INTO wheat_crop_id FROM crops WHERE name ILIKE '%wheat%' LIMIT 1;

  IF wheat_crop_id IS NOT NULL THEN
    INSERT INTO milestone_templates (crop_id, name, description, sequence)
    VALUES
      (wheat_crop_id, 'Sowing', 'Farm has been sown with certified seed', 1),
      (wheat_crop_id, 'Tillering', 'Crop has reached the tillering growth stage', 2),
      (wheat_crop_id, 'Grain Filling and Ripening', 'Crop is in the grain filling and ripening stage', 3)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- 4. Storage bucket for stage images
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('stage-images', 'stage-images', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated farmers to upload
CREATE POLICY "Farmers can upload stage images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'stage-images');

-- Allow anyone to view (public bucket)
CREATE POLICY "Anyone can view stage images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'stage-images');

-- Allow farmers to delete/update their own uploads
CREATE POLICY "Farmers can update own stage images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'stage-images' AND auth.uid() = owner::uuid);
