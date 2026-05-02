<?php

declare(strict_types=1);

namespace Ahmedhsieb\Analyzer\Security;

class AnalyzerAuthManager
{
    public function isConfigured(): bool
    {
        $data = $this->read();

        return isset($data['username'], $data['password_hash'])
            && is_string($data['username'])
            && is_string($data['password_hash'])
            && $data['username'] !== ''
            && $data['password_hash'] !== '';
    }

    public function username(): ?string
    {
        $data = $this->read();

        if (! isset($data['username']) || ! is_string($data['username']) || $data['username'] === '') {
            return null;
        }

        return $data['username'];
    }

    public function verify(string $username, string $password): bool
    {
        $data = $this->read();
        if (! isset($data['username'], $data['password_hash'])) {
            return false;
        }

        if (! is_string($data['username']) || ! is_string($data['password_hash'])) {
            return false;
        }

        if (! hash_equals($data['username'], $username)) {
            return false;
        }

        return password_verify($password, $data['password_hash']);
    }

    public function save(string $username, string $password): void
    {
        $username = trim($username);
        if ($username === '') {
            throw new \InvalidArgumentException('Username cannot be empty.');
        }

        if ($password === '') {
            throw new \InvalidArgumentException('Password cannot be empty.');
        }

        $dir = dirname($this->path());
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $this->writePayload([
            'username' => $username,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'updated_at' => date(DATE_ATOM),
        ]);
    }

    public function change(string $username, ?string $newPassword = null): void
    {
        $username = trim($username);
        if ($username === '') {
            throw new \InvalidArgumentException('Username cannot be empty.');
        }

        $current = $this->read();
        if (! isset($current['password_hash']) || ! is_string($current['password_hash']) || $current['password_hash'] === '') {
            throw new \RuntimeException('Current credentials are missing.');
        }

        $passwordHash = $current['password_hash'];
        if ($newPassword !== null && $newPassword !== '') {
            $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
        }

        $this->writePayload([
            'username' => $username,
            'password_hash' => $passwordHash,
            'updated_at' => date(DATE_ATOM),
        ]);
    }

    public function path(): string
    {
        return storage_path('app/analyzer/.auth.json');
    }

    /**
     * @return array<string, mixed>
     */
    private function read(): array
    {
        $path = $this->path();
        if (! is_file($path)) {
            return [];
        }

        $raw = file_get_contents($path);
        if (! is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            return [];
        }

        return $decoded;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function writePayload(array $payload): void
    {
        $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('Failed to encode auth credentials.');
        }

        file_put_contents($this->path(), $json);
    }
}
