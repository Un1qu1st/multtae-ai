CREATE TABLE `farm_action_log` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`observation_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reservoir_key` text NOT NULL,
	`reservoir_name` text NOT NULL,
	`observation_date` text NOT NULL,
	`action_title` text NOT NULL,
	`action_tone` text NOT NULL,
	`crop` text NOT NULL,
	`stage` text NOT NULL,
	`initial_moisture` text NOT NULL,
	`data_source` text NOT NULL,
	`current_rate` real NOT NULL,
	`water_status` text NOT NULL,
	`three_day_rain` real,
	`forecast_decision` text NOT NULL,
	`forecast_adoption` text NOT NULL,
	`actual_rain` text,
	`next_moisture` text,
	`action_taken` text,
	`helpfulness` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farm_action_log_participant_observation_idx` ON `farm_action_log` (`participant_id`,`observation_key`);--> statement-breakpoint
CREATE INDEX `farm_action_log_participant_idx` ON `farm_action_log` (`participant_id`);--> statement-breakpoint
CREATE INDEX `farm_action_log_status_idx` ON `farm_action_log` (`status`);--> statement-breakpoint
CREATE INDEX `farm_action_log_created_at_idx` ON `farm_action_log` (`created_at`);