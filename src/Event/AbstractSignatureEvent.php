<?php

namespace katosdev\Signature\Event;

use Flarum\User\User;

abstract class AbstractSignatureEvent
{
    public function __construct(
        public User $user,
        public ?User $actor = null
    ) {
    }
}
