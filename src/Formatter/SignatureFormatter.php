<?php

namespace katosdev\Signature\Formatter;

use Flarum\Extension\ExtensionManager;
use Flarum\Formatter\Formatter;
use Illuminate\Contracts\Cache\Repository;
use s9e\TextFormatter\Configurator;
use s9e\TextFormatter\Parser;

class SignatureFormatter extends Formatter
{
    protected ExtensionManager $extensions;

    public function __construct(Repository $cache, string $cacheDir, ExtensionManager $extensions)
    {
        parent::__construct($cache, $cacheDir);

        $this->extensions = $extensions;
    }

    protected function getComponent(string $name): mixed
    {
        $formatter = $this->cache->rememberForever('katosdev-signature.formatter', function () {
            return $this->getConfigurator()->finalize();
        });

        return $formatter[$name];
    }

    protected function getParser(mixed $context = null): Parser
    {
        $parser = parent::getParser($context);

        $parser->disableTag('IFRAME');
        $parser->disableTag('EMBED');

        return $parser;
    }

    protected function getConfigurator(): Configurator
    {
        $configurator = parent::getConfigurator();

        if ($this->extensions->isEnabled('flarum-markdown')) {
            /** @phpstan-ignore-next-line */
            $configurator->Litedown;
        }

        if ($this->extensions->isEnabled('flarum-bbcode')) {
            (new \Flarum\BBCode\Configure())($configurator);
        }

        return $configurator;
    }

    public function flush(): void
    {
        $this->cache->forget('katosdev-signature.formatter');
    }
}
