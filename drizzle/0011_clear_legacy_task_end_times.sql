-- The old task form stored a hidden default end time.
UPDATE items SET end_time = '' WHERE type = 'task';
