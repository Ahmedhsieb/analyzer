<?php

declare(strict_types=1);

namespace Ahmedhsieb\Analyzer\Commands;

use Ahmedhsieb\Analyzer\Security\AnalyzerAuthManager;
use Illuminate\Console\Command;

class SetupAuthCommand extends Command
{
    protected $signature = 'analyzer:setup-auth
        {--username= : Username for analyzer login}
        {--password= : Password for analyzer login}';

    protected $description = 'Setup username/password authentication for Analyzer viewer';

    public function handle(): int
    {
        $manager = new AnalyzerAuthManager;

        $username = trim((string) $this->option('username'));
        if ($username === '') {
            $username = trim((string) $this->ask('Analyzer username'));
        }

        if ($username === '') {
            $this->error('Username cannot be empty.');

            return self::FAILURE;
        }

        $password = (string) $this->option('password');
        if ($password === '') {
            $password = (string) $this->secret('Analyzer password');
            $confirm = (string) $this->secret('Confirm password');

            if ($password !== $confirm) {
                $this->error('Password confirmation does not match.');

                return self::FAILURE;
            }
        }

        if ($password === '') {
            $this->error('Password cannot be empty.');

            return self::FAILURE;
        }

        try {
            $manager->save($username, $password);
        } catch (\Throwable $e) {
            $this->error('Failed to save credentials: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Analyzer authentication configured.');
        $this->line('Username: <fg=cyan>'.$username.'</>');
        $this->line('Credentials file: <fg=gray>'.$manager->path().'</>');
        $this->newLine();
        $this->line('Open login page: <fg=cyan>'.rtrim((string) config('app.url', 'http://localhost:8000'), '/').'/_analyzer/login</>');

        return self::SUCCESS;
    }
}

