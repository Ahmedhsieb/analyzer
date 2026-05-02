<?php

declare(strict_types=1);

namespace Ahmedhsieb\Analyzer\Commands;

use Ahmedhsieb\Analyzer\Security\AnalyzerAuthManager;
use Illuminate\Console\Command;

class ChangeAuthCommand extends Command
{
    protected $signature = 'analyzer:change-auth
        {--current-username= : Current analyzer username}
        {--current-password= : Current analyzer password}
        {--username= : New analyzer username}
        {--password= : New analyzer password}';

    protected $description = 'Change Analyzer login username/password';

    public function handle(): int
    {
        $manager = new AnalyzerAuthManager;

        if (! $manager->isConfigured()) {
            $this->error('Analyzer auth is not configured. Run: php artisan analyzer:setup-auth');

            return self::FAILURE;
        }

        $currentUsername = trim((string) $this->option('current-username'));
        if ($currentUsername === '') {
            $defaultUser = $manager->username() ?? '';
            $currentUsername = trim((string) $this->ask('Current username', $defaultUser));
        }

        if ($currentUsername === '') {
            $this->error('Current username cannot be empty.');

            return self::FAILURE;
        }

        $currentPassword = (string) $this->option('current-password');
        if ($currentPassword === '') {
            $currentPassword = (string) $this->secret('Current password');
        }

        if ($currentPassword === '') {
            $this->error('Current password cannot be empty.');

            return self::FAILURE;
        }

        if (! $manager->verify($currentUsername, $currentPassword)) {
            $this->error('Current credentials are invalid.');

            return self::FAILURE;
        }

        $newUsername = trim((string) $this->option('username'));
        if ($newUsername === '') {
            $newUsername = trim((string) $this->ask('New username (leave as current to keep)', $currentUsername));
        }

        if ($newUsername === '') {
            $this->error('New username cannot be empty.');

            return self::FAILURE;
        }

        $newPassword = (string) $this->option('password');
        if ($newPassword === '') {
            $newPassword = (string) $this->secret('New password (leave empty to keep current)');

            if ($newPassword !== '') {
                $confirm = (string) $this->secret('Confirm new password');
                if ($confirm !== $newPassword) {
                    $this->error('Password confirmation does not match.');

                    return self::FAILURE;
                }
            }
        }

        try {
            $manager->change($newUsername, $newPassword !== '' ? $newPassword : null);
        } catch (\Throwable $e) {
            $this->error('Failed to update auth credentials: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Analyzer auth credentials updated successfully.');
        $this->line('Username: <fg=cyan>'.$newUsername.'</>');
        if ($newPassword !== '') {
            $this->line('Password: <fg=green>updated</>');
        } else {
            $this->line('Password: <fg=gray>unchanged</>');
        }

        return self::SUCCESS;
    }
}

