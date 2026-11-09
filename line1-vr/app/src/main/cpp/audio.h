// Procedural train sound (Android only): rolling noise, rail joints, door chime.
#pragma once
#include "app.h"

void audioStart();
void audioStop();
void audioUpdate(const AudioState& s);
