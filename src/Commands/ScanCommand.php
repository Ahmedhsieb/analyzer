<?php

declare(strict_types=1);

namespace Ahmedhsieb\Analyzer\Commands;

use Ahmedhsieb\Analyzer\Analysis\ProjectAnalyzer;
use Ahmedhsieb\Analyzer\Analysis\ProjectStructure;
use Illuminate\Console\Command;

class ScanCommand extends Command
{
    protected $signature = 'analyzer:analyze
        {--path= : Filter results to a specific directory/file path (comma-separated)}
        {--route= : Filter by route URI or "METHOD /uri" (comma-separated)}
        {--group= : Filter by route group/prefix (comma-separated)}
        {--controller= : Filter by controller class/name (comma-separated)}
        {--watch : Re-run scan when PHP files change}
        {--interval=3 : Poll interval (seconds) in watch mode}';

    protected $aliases = ['analyzer:scan'];

    protected $description = 'Analyze architecture and build graph JSON files for the Analyzer viewer';

    private ProjectStructure $projectStructure;

    /**
     * @var array{path: string[], route: string[], group: string[], controller: string[]}
     */
    private array $filters = ['path' => [], 'route' => [], 'group' => [], 'controller' => []];

    public function __construct()
    {
        parent::__construct();
        $this->projectStructure = new ProjectStructure;
    }

    public function handle(): int
    {
        $projectRoot = (string) base_path();
        $pathOption = trim((string) $this->option('path'));

        $this->filters = [
            'path' => $this->buildPathFilters($projectRoot, $pathOption),
            'route' => $this->parseListOption((string) $this->option('route')),
            'group' => $this->parseListOption((string) $this->option('group')),
            'controller' => $this->parseListOption((string) $this->option('controller')),
        ];

        $interval = max(1, (int) $this->option('interval'));

        ini_set('memory_limit', '1024M');
        set_time_limit(0);

        $this->renderHeader($projectRoot);

        if ((bool) $this->option('watch')) {
            return $this->runWatchMode($projectRoot, $interval);
        }

        return $this->runScan($projectRoot);
    }

    private function runWatchMode(string $projectRoot, int $interval): int
    {
        $this->line('  <fg=gray>Watch mode:</> <fg=yellow>ON</>');
        $this->line("  <fg=gray>Poll interval:</> <fg=yellow>{$interval}s</>");
        $this->newLine();

        $code = $this->runScan($projectRoot);
        if ($code !== self::SUCCESS) {
            return $code;
        }

        $this->line('  <fg=gray>Waiting for PHP file changes... Press Ctrl+C to stop.</>');

        $lastSnapshot = $this->buildPhpSnapshot($projectRoot);

        while (true) {
            sleep($interval);
            clearstatcache();

            $snapshot = $this->buildPhpSnapshot($projectRoot);
            if ($snapshot === $lastSnapshot) {
                continue;
            }

            $this->newLine();
            $this->line('  <fg=yellow>Change detected. Re-scanning...</>');

            $code = $this->runScan($projectRoot);
            if ($code !== self::SUCCESS) {
                return $code;
            }

            $lastSnapshot = $snapshot;
            $this->line('  <fg=gray>Waiting for PHP file changes... Press Ctrl+C to stop.</>');
        }
    }

    private function runScan(string $projectRoot): int
    {
        $startedAt = microtime(true);
        $stepStartedAt = [];

        $analyzer = new ProjectAnalyzer;

        try {
            $result = $analyzer->analyze(
                $projectRoot,
                function (string $event, array $data) use (&$stepStartedAt): void {
                    if ($event === 'step:start') {
                        $step = (string) ($data['step'] ?? 'step');
                        $stepStartedAt[$step] = microtime(true);

                        return;
                    }

                    if ($event === 'step:done') {
                        $this->renderStepDone($data, $stepStartedAt);
                    }
                },
                $this->filters,
            );
        } catch (\Throwable $e) {
            $this->newLine();
            $this->error('  Scan failed.');
            $this->line('  '.get_class($e).': '.$e->getMessage());
            if ($e->getFile() !== '') {
                $this->line('  at '.$e->getFile().':'.$e->getLine());
            }

            return self::FAILURE;
        }

        $storageDir = storage_path('app/analyzer');
        if (! is_dir($storageDir)) {
            mkdir($storageDir, 0755, true);
        }

        foreach (glob($storageDir.'/.graph-*.json') ?: [] as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }

        file_put_contents($storageDir.'/.graph-manifest.json', $result->manifestJson);
        file_put_contents($storageDir.'/.graph-all.json', $result->fullGraph->toJson());
        foreach ($result->subgraphs as $tabId => $subgraph) {
            file_put_contents($storageDir."/.graph-{$tabId}.json", $subgraph->toJson());
        }

        $totalTime = number_format(microtime(true) - $startedAt, 2);

        $this->newLine();
        $this->line('  <fg=gray>'.$this->hLine(52).'</>');
        $this->line('  <options=bold>Summary</>');
        $this->newLine();
        $this->line(sprintf('    <fg=gray>%-16s</> <fg=cyan>%s</>', 'Nodes', $result->fullGraph->nodeCount()));
        $this->line(sprintf('    <fg=gray>%-16s</> <fg=cyan>%s</>', 'Edges', $result->fullGraph->edgeCount()));
        $this->line(sprintf('    <fg=gray>%-16s</> <fg=cyan>%s</>', 'Routes', $result->totalRoutes));
        $this->line(sprintf('    <fg=gray>%-16s</> <fg=cyan>%s</>', 'Commands', $result->totalCommands));
        $this->line(sprintf('    <fg=gray>%-16s</> <fg=cyan>%s</>', 'Channels', $result->totalChannels));
        $this->line(sprintf('    <fg=gray>%-16s</> <fg=yellow>%ss</>', 'Total time', $totalTime));
        $this->line('  <fg=gray>'.$this->hLine(52).'</>');
        $this->newLine();

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');
        $this->line('  Open the viewer: <fg=cyan;options=bold>'.$appUrl.'/_analyzer</>');

        return self::SUCCESS;
    }

    private function renderHeader(string $projectRoot): void
    {
        $this->line('');
        $this->line('  <fg=cyan>+----------------------------------------------------+</>');
        $this->line('  <fg=cyan>|</> <options=bold>Analyzer</> <fg=gray>- architecture analysis</>                 <fg=cyan>|</>');
        $this->line('  <fg=cyan>+----------------------------------------------------+</>');
        $this->line('  Project: <fg=gray>'.$projectRoot.'</>');

        $this->renderFilterHint();
        $this->line('');
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, float> $stepStartedAt
     */
    private function renderStepDone(array $data, array $stepStartedAt): void
    {
        $step = (string) ($data['step'] ?? 'step');
        $count = $data['count'] ?? null;
        $unit = (string) ($data['unit'] ?? '');
        $extra = (string) ($data['extra'] ?? '');

        $elapsed = isset($stepStartedAt[$step]) ? (microtime(true) - $stepStartedAt[$step]) : 0.0;

        $left = sprintf('<fg=green>[%s]</> %-16s', $this->checkMark(), $step.'...');

        $details = '';
        if (is_int($count)) {
            $details = (string) $count;
            if ($unit !== '') {
                $details .= ' '.$unit.($count === 1 ? '' : 's');
            }
        }

        if ($extra !== '') {
            $details = trim($details.' '.$extra);
        }

        $time = '<fg=gray>('.number_format($elapsed, 2).'s)</>';

        if ($details !== '') {
            $line = sprintf('  %-32s <fg=yellow>%-24s</> %s', $left, $details, $time);
        } else {
            $line = sprintf('  %-32s %s', $left, $time);
        }

        $this->line($line);
    }

    /**
     * @return array<string, int>
     */
    private function buildPhpSnapshot(string $projectRoot): array
    {
        $snapshot = [];
        $roots = $this->projectStructure->discoverRoots($projectRoot);

        foreach ($roots as $root) {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveCallbackFilterIterator(
                    new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
                    function (\SplFileInfo $entry): bool {
                        $name = $entry->getFilename();

                        if ($entry->isDir()) {
                            return ! in_array($name, ['vendor', 'node_modules', '.git', '.idea', '.vscode', 'storage'], true);
                        }

                        return strtolower($entry->getExtension()) === 'php';
                    }
                )
            );

            foreach ($iterator as $file) {
                if (! $file instanceof \SplFileInfo || ! $file->isFile()) {
                    continue;
                }

                $snapshot[$file->getPathname()] = $file->getMTime();
            }
        }

        ksort($snapshot);

        return $snapshot;
    }

    private function checkMark(): string
    {
        return 'OK';
    }

    private function hLine(int $length): string
    {
        return str_repeat('-', $length);
    }

    /**
     * @return string[]
     */
    private function parseListOption(string $value): array
    {
        $value = trim($value);
        if ($value === '') {
            return [];
        }

        return array_values(array_filter(array_map('trim', explode(',', $value)), static fn (string $item): bool => $item !== ''));
    }

    /**
     * @return string[]
     */
    private function buildPathFilters(string $projectRoot, string $pathOption): array
    {
        if ($pathOption === '') {
            return [];
        }

        $items = $this->parseListOption($pathOption);
        $base = str_replace('\\', '/', rtrim($projectRoot, '\\/'));
        $filters = [];

        foreach ($items as $item) {
            $candidate = str_replace('\\', '/', trim($item));
            if (! preg_match('/^[A-Za-z]:\/|^\/\//', $candidate)) {
                $candidate = $base.'/'.ltrim($candidate, '/');
            }

            $real = realpath($candidate);
            if ($real !== false) {
                $candidate = str_replace('\\', '/', $real);
            }

            $candidate = strtolower(rtrim($candidate, '/'));
            if ($candidate === '') {
                continue;
            }

            $filters[] = $candidate;

            if (str_starts_with($candidate, strtolower($base).'/')) {
                $relative = ltrim(substr($candidate, strlen($base)), '/');
                if ($relative !== '') {
                    $filters[] = strtolower($relative);
                }
            }
        }

        return array_values(array_unique($filters));
    }

    private function renderFilterHint(): void
    {
        $bits = [];

        if ($this->filters['path'] !== []) {
            $bits[] = 'path='.implode(',', $this->filters['path']);
        }
        if ($this->filters['route'] !== []) {
            $bits[] = 'route='.implode(',', $this->filters['route']);
        }
        if ($this->filters['group'] !== []) {
            $bits[] = 'group='.implode(',', $this->filters['group']);
        }
        if ($this->filters['controller'] !== []) {
            $bits[] = 'controller='.implode(',', $this->filters['controller']);
        }

        if ($bits !== []) {
            $this->line('  Scope: <fg=yellow>'.implode(' | ', $bits).'</>');
        }
    }
}
