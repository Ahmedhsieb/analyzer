<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain;

use Illuminate\Support\ServiceProvider;
use LaraMint\LaravelBrain\Commands\ScanCommand;

class LaravelBrainServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Only register routes and commands in local environment for security
        if (! $this->app->isLocal()) {
            return;
        }

        $this->loadViewsFrom(__DIR__.'/../resources/views', 'analyzer');
        $this->commands([ScanCommand::class]);
        $this->loadRoutesFrom(__DIR__.'/../routes/brain.php');
    }
}

