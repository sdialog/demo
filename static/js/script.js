document.addEventListener('DOMContentLoaded', () => {

    // Modal elements
    const settingsBtn = document.getElementById('settings-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const settingsModal = document.getElementById('settings-modal');

    // Form and list elements
    const createPersonaForm = document.getElementById('create-persona-form');
    const personasList = document.getElementById('personas-list');
    const persona1Select = document.getElementById('persona1');
    const persona2Select = document.getElementById('persona2');
    const createDialogForm = document.getElementById('create-dialog-form');
    const dialogDisplay = document.getElementById('dialog-display');
    const voicesList = document.getElementById('voices-list');
    const personaVoiceAssignments = document.getElementById('persona-voice-assignments');
    const createRoomForm = document.getElementById('create-room-form');
    const roomsList = document.getElementById('rooms-list');
    const audioRoomSelect = document.getElementById('audio-room');
    let currentDialogId = null;
    let generatedAudioForDialogs = new Set();

    // Room gen elements
    const generatorType = document.getElementById('generator-type');
    const customParams = document.getElementById('custom-params');
    const basicParams = document.getElementById('basic-params');
    const medicalParams = document.getElementById('medical-params');

    // LLM Config elements
    const llmProvider = document.getElementById('llm-provider');
    const llmModelName = document.getElementById('llm-model-name');
    const awsRegion = document.getElementById('aws-region');
    const awsBearerToken = document.getElementById('aws-bearer-token');

    // --- Modal Logic ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    settingsModal.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // --- Room Gen Logic ---
    generatorType.addEventListener('change', () => {
        customParams.classList.add('hidden');
        basicParams.classList.add('hidden');
        medicalParams.classList.add('hidden');

        if (generatorType.value === 'custom') {
            customParams.classList.remove('hidden');
        } else if (generatorType.value === 'basic') {
            basicParams.classList.remove('hidden');
        } else if (generatorType.value === 'medical') {
            medicalParams.classList.remove('hidden');
        }
    });

    // --- LLM Config Logic ---
    const saveLlmConfig = () => {
        const config = {
            provider: llmProvider.value,
            model_name: llmModelName.value,
            region_name: awsRegion.value,
            aws_bearer_token: awsBearerToken.value,
        };
        localStorage.setItem('llmConfig', JSON.stringify(config));
    };

    const loadLlmConfig = () => {
        const savedConfig = localStorage.getItem('llmConfig');
        if (savedConfig) {
            const config = JSON.parse(savedConfig);
            llmProvider.value = config.provider || 'ollama';
            llmModelName.value = config.model_name || 'llama2';
            awsRegion.value = config.region_name || 'us-east-1';
            awsBearerToken.value = config.aws_bearer_token || '';

            llmProvider.dispatchEvent(new Event('change'));
        }
    };

    llmProvider.addEventListener('change', () => {
        const bedrockOptions = document.getElementById('bedrock-options');
        bedrockOptions.style.display = llmProvider.value === 'amazon' ? 'block' : 'none';
        saveLlmConfig();
    });
    llmModelName.addEventListener('keyup', saveLlmConfig);
    awsRegion.addEventListener('keyup', saveLlmConfig);
    awsBearerToken.addEventListener('keyup', saveLlmConfig);


    const fetchPersonas = () => {
        fetch('/api/personas')
            .then(response => response.json())
            .then(personas => {
                personasList.innerHTML = '';
                persona1Select.innerHTML = '<option value="">Select Persona 1</option>';
                persona2Select.innerHTML = '<option value="">Select Persona 2</option>';

                if (personas.length === 0) {
                    personasList.innerHTML = '<p class="text-gray-400">No personas created yet. Create one or generate speakers.</p>';
                    return;
                }

                personas.forEach(persona => {
                    const personaDiv = document.createElement('div');
                    personaDiv.className = 'persona-card bg-gray-700 p-4 rounded-md';
                    personaDiv.innerHTML = `
                        <h4 class="font-bold">${persona.name}</h4>
                        <p class="text-sm text-gray-400">${persona.role || ''}</p>
                        <details class="mt-2 text-xs">
                            <summary class="cursor-pointer">Details</summary>
                            <pre class="mt-2 p-2 bg-gray-800 rounded text-gray-300 text-xs">${JSON.stringify(persona, null, 2)}</pre>
                        </details>
                    `;
                    personasList.appendChild(personaDiv);

                    [persona1Select, persona2Select].forEach(select => {
                        const option = document.createElement('option');
                        option.value = persona.name;
                        option.textContent = persona.name;
                        select.appendChild(option);
                    });
                });
            });
    };

    const fetchVoices = () => {
        fetch('/api/voices')
            .then(response => response.json())
            .then(voices => {
                voicesList.innerHTML = '';
                voices.forEach(voice => {
                    const voiceDiv = document.createElement('div');
                    voiceDiv.className = 'p-2 bg-gray-700 rounded mb-2';
                    voiceDiv.innerHTML = `<p class="text-sm font-mono">${voice.identifier}</p><p class="text-xs text-gray-400">${voice.gender}, ${voice.age}, ${voice.language}</p>`;
                    voicesList.appendChild(voiceDiv);
                });
            });
    };

    const fetchPersonaVoiceAssignments = () => {
        fetch('/api/persona-voices')
            .then(response => response.json())
            .then(assignments => {
                if (Object.keys(assignments).length === 0) {
                    personaVoiceAssignments.innerHTML = '<p class="text-gray-400">No voices assigned yet.</p>';
                    return;
                }
                let content = '<ul class="list-disc list-inside">';
                for (const [persona, voice] of Object.entries(assignments)) {
                    content += `<li class="text-sm"><span class="font-semibold">${persona}</span>: ${voice}</li>`;
                }
                content += '</ul>';
                personaVoiceAssignments.innerHTML = content;
            });
    };

    const fetchRooms = () => {
        fetch('/api/rooms')
            .then(response => response.json())
            .then(rooms => {
                roomsList.innerHTML = '';
                audioRoomSelect.innerHTML = '<option value="">Select a room</option>';
                
                const availableRoomsHeader = document.getElementById('available-rooms-header');
                if (availableRoomsHeader) {
                    availableRoomsHeader.textContent = `Available Rooms (${rooms.length})`;
                }

                if (rooms.length === 0) {
                    roomsList.innerHTML = '<p class="text-gray-400">No rooms created yet.</p>';
                    return;
                }
                rooms.forEach(room => {
                    const roomDiv = document.createElement('div');
                    roomDiv.className = 'bg-gray-700 p-4 rounded-md mb-4';

                    const roomHeader = document.createElement('h4');
                    roomHeader.className = 'font-bold cursor-pointer flex justify-between items-center';
                    roomHeader.innerHTML = `
                        <span>${room.name}</span>
                        <button class="delete-room-btn text-red-500 hover:text-red-700 text-xs" data-id="${room.id}">Delete</button>
                    `;

                    const roomContent = document.createElement('div');
                    roomContent.className = 'collapsible-content'; // Initially expanded
                    roomContent.innerHTML = `
                        <img src="/api/rooms/${room.id}/image" alt="Room layout for ${room.name}" class="my-2 rounded-md">
                        <details class="mt-2 text-xs">
                            <summary class="cursor-pointer">Details</summary>
                            <pre class="mt-2 p-2 bg-gray-800 rounded text-gray-300 text-xs">${JSON.stringify(room, null, 2)}</pre>
                        </details>
                    `;

                    roomHeader.querySelector('.delete-room-btn').addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent the collapse toggle
                        const roomId = e.target.getAttribute('data-id');
                        if (confirm(`Are you sure you want to delete room "${room.name}"?`)) {
                            fetch(`/api/rooms/${roomId}`, { method: 'DELETE' })
                                .then(response => {
                                    if (!response.ok) throw new Error('Failed to delete room');
                                    fetchRooms(); // Refresh the list
                                })
                                .catch(error => alert(`Error: ${error.message}`));
                        }
                    });

                    roomHeader.querySelector('span').addEventListener('click', () => {
                        roomContent.classList.toggle('collapsed');
                    });

                    roomDiv.appendChild(roomHeader);
                    roomDiv.appendChild(roomContent);
                    roomsList.appendChild(roomDiv);

                    const option = document.createElement('option');
                    option.value = room.name;
                    option.textContent = room.name;
                    audioRoomSelect.appendChild(option);
                });
            });
    };

    createPersonaForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(createPersonaForm);
        const data = Object.fromEntries(formData.entries());

        fetch('/api/personas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(() => {
            fetchPersonas();
            createPersonaForm.reset();
        })
        .catch(error => alert(`Error: ${error.message}`));
    });

    document.getElementById('generate-speakers-btn').addEventListener('click', () => {
        const button = document.getElementById('generate-speakers-btn');
        button.textContent = 'Generating...';
        button.disabled = true;
        button.classList.add('loading');

        const model_config = {
            provider: llmProvider.value,
            model_name: llmModelName.value,
            region_name: awsRegion.value,
            aws_bearer_token: awsBearerToken.value,
        };

        fetch('/api/personas/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_config }),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(() => fetchPersonas())
        .catch(error => alert(`Error generating personas: ${error.message}`))
        .finally(() => {
            button.textContent = 'Generate Speakers (speaker 1 & speaker 2)';
            button.disabled = false;
            button.classList.remove('loading');
        });
    });

    document.getElementById('auto-assign-voices-btn').addEventListener('click', () => {
        const button = document.getElementById('auto-assign-voices-btn');
        button.textContent = 'Assigning...';
        button.disabled = true;
        button.classList.add('loading');

        fetch('/api/auto-assign-voices', { method: 'POST' })
            .then(response => {
                if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
                return response.json();
            })
            .then(() => {
                fetchPersonaVoiceAssignments();
                generatedAudioForDialogs.clear();
                console.log('Voice assignments have been updated. TTS cache cleared.');
            })
            .catch(error => alert(`Error auto-assigning voices: ${error.message}`))
            .finally(() => {
                button.textContent = 'Auto-assign Voices';
                button.disabled = false;
                button.classList.remove('loading');
            });
    });

    createRoomForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(createRoomForm);
        const data = {};

        data.name = formData.get('name');
        data.generator_type = formData.get('generator_type');

        if (data.generator_type === 'custom') {
            data.width = formData.get('width');
            data.length = formData.get('length');
            data.height = formData.get('height');
        } else if (data.generator_type === 'basic') {
            data.room_size = formData.get('room_size');
        } else if (data.generator_type === 'medical') {
            data.room_type = formData.get('room_type');
        }

        fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(() => {
            fetchRooms();
            // Don't reset the whole form, just the name, to keep selections
            document.getElementById('room-name').value = '';
        })
        .catch(error => alert(`Error creating room: ${error.message}`));
    });

    createDialogForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(createDialogForm);
        const data = {
            persona1: formData.get('persona1'),
            persona2: formData.get('persona2'),
            context: {
                location: formData.get('location'),
                topics: formData.get('topics').split(',').map(t => t.trim()).filter(t => t),
            },
            max_turns: parseInt(formData.get('max_turns'), 10),
            model_config: {
                provider: llmProvider.value,
                model_name: llmModelName.value,
                region_name: awsRegion.value,
                aws_bearer_token: awsBearerToken.value,
            }
        };

        dialogDisplay.innerHTML = '<p>Generating dialog...</p>';

        fetch('/api/dialogs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(dialog => {
            currentDialogId = dialog.id;
            dialogDisplay.innerHTML = `
                <h4 class="font-bold mb-2">Dialog ID: ${dialog.id}</h4>
                <div class="space-y-2">
                    ${dialog.turns.map(turn => `<p><span class="font-semibold">${turn.speaker}:</span> ${turn.text}</p>`).join('')}
                </div>
            `;
        })
        .catch(error => {
            dialogDisplay.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
        });
    });

    document.getElementById('generate-audio').addEventListener('click', () => {
        if (!currentDialogId) {
            alert('Please generate a dialog first.');
            return;
        }
        const roomName = audioRoomSelect.value;
        if (!roomName) {
            alert('Please select a room for audio generation.');
            return;
        }
        
        const audioPlayer = document.getElementById('audio-player');
        audioPlayer.innerHTML = '<p>Generating audio...</p>';
        const button = document.getElementById('generate-audio');
        button.textContent = 'Generating Audio...';
        button.disabled = true;
        button.classList.add('loading');

        const override_tts = !generatedAudioForDialogs.has(currentDialogId);

        fetch(`/api/dialogs/${currentDialogId}/generate-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                do_step_1: override_tts,
                do_step_2: true,
                do_step_3: true,
                room_name: roomName,
            }),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(audioDialog => {
            if (override_tts) {
                console.log(`TTS generated for dialog ${currentDialogId}. Caching.`);
                generatedAudioForDialogs.add(currentDialogId);
            } else {
                console.log(`Using cached TTS for dialog ${currentDialogId}.`);
            }

            audioPlayer.innerHTML = '';
            const createAudioPlayer = (path, title) => {
                if (!path) return '';
                const url = '/' + path.substring(path.indexOf('static/'));
                return `
                    <div>
                        <h4 class="font-semibold">${title}</h4>
                        <audio controls src="${url}" class="w-full mt-1"></audio>
                    </div>
                `;
            };

            audioPlayer.innerHTML += createAudioPlayer(audioDialog.audio_step_1_filepath, 'Utterances');
            // audioPlayer.innerHTML += createAudioPlayer(audioDialog.audio_step_2_filepath, 'Step 2: Combined Audio');
            if (audioDialog.audio_step_3_filepaths) {
                 for(const [room, data] of Object.entries(audioDialog.audio_step_3_filepaths)) {
                    audioPlayer.innerHTML += createAudioPlayer(data.audio_path, `Room Acoustics Simulation: ${room}`);
                 }
            }
        })
        .catch(error => {
            audioPlayer.innerHTML = `<p class="text-red-400">Error generating audio: ${error.message}</p>`;
        })
        .finally(() => {
            button.textContent = 'Generate Audio';
            button.disabled = false;
            button.classList.remove('loading');
        });
    });

    document.querySelectorAll('.collapsible').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            const content = header.nextElementSibling;
            content.classList.toggle('collapsed');
        });
    });

    // Initial data fetch
    fetchPersonas();
    fetchVoices();
    fetchPersonaVoiceAssignments();
    fetchRooms();
    loadLlmConfig();
});
