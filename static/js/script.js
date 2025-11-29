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

    // Audio Gen Config elements
    const backgroundEffect = document.getElementById('background-effect');
    const foregroundEffect = document.getElementById('foreground-effect');
    const foregroundEffectPosition = document.getElementById('foreground-effect-position');
    const sourceVolumeRoom = document.getElementById('source-volume-room');
    const sourceVolumeBackground = document.getElementById('source-volume-background');
    const rayTracing = document.getElementById('ray-tracing');
    const airAbsorption = document.getElementById('air-absorption');

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

    // --- Furniture Modal Logic ---
    const addFurnitureModal = document.getElementById('add-furniture-modal');
    const closeFurnitureModalBtn = document.getElementById('close-furniture-modal-btn');
    const addFurnitureForm = document.getElementById('add-furniture-form');
    const furnitureModalRoomName = document.getElementById('furniture-modal-room-name');
    const furnitureRoomIdInput = document.getElementById('furniture-room-id');

    const openFurnitureModal = (roomId, roomName) => {
        furnitureModalRoomName.textContent = roomName;
        furnitureRoomIdInput.value = roomId;
        addFurnitureForm.reset();
        addFurnitureModal.classList.remove('hidden');
    };

    const closeFurnitureModal = () => {
        addFurnitureModal.classList.add('hidden');
    };

    closeFurnitureModalBtn.addEventListener('click', closeFurnitureModal);
    addFurnitureModal.addEventListener('click', (event) => {
        if (event.target === addFurnitureModal) {
            closeFurnitureModal();
        }
    });

    addFurnitureForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(addFurnitureForm);
        const data = Object.fromEntries(formData.entries());
        const roomId = data.room_id;

        fetch(`/api/rooms/${roomId}/furniture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(() => {
            closeFurnitureModal();
            fetchRooms(); // Refresh the list to show the new furniture
        })
        .catch(error => alert(`Error adding furniture: ${error.message}`));
    });

    // --- Speaker Positions Modal Logic ---
    const setSpeakerPositionsModal = document.getElementById('set-speaker-positions-modal');
    const closeSpeakerModalBtn = document.getElementById('close-speaker-modal-btn');
    const setSpeakerPositionsForm = document.getElementById('set-speaker-positions-form');
    const speakerModalRoomName = document.getElementById('speaker-modal-room-name');
    const speakerRoomIdInput = document.getElementById('speaker-room-id');
    let roomsCache = new Map();
    const speakerModalCache = new Map();

    document.querySelectorAll('.speaker-placement-type').forEach(select => {
        select.addEventListener('change', (e) => {
            const speakerCard = e.target.closest('.speaker-config-card');
            const absoluteParams = speakerCard.querySelector('.speaker-absolute-params');
            const relativeParams = speakerCard.querySelector('.speaker-relative-params');
            if (e.target.value === 'absolute') {
                absoluteParams.classList.remove('hidden');
                relativeParams.classList.add('hidden');
            } else {
                absoluteParams.classList.add('hidden');
                relativeParams.classList.remove('hidden');
            }
        });
    });

    const openSpeakerPositionsModal = (room) => {
        speakerModalRoomName.textContent = room.name;
        speakerRoomIdInput.value = room.id;
    
        // Populate furniture dropdowns
        const furnitureSelects = setSpeakerPositionsModal.querySelectorAll('.furniture-select');
        furnitureSelects.forEach(select => {
            select.innerHTML = ''; // Clear previous options
            if (room.furnitures && Object.keys(room.furnitures).length > 0) {
                Object.keys(room.furnitures).forEach(furnitureName => {
                    const option = document.createElement('option');
                    option.value = furnitureName;
                    option.textContent = furnitureName;
                    select.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.textContent = 'No furniture available';
                option.disabled = true;
                select.appendChild(option);
            }
        });
    
        if (speakerModalCache.has(room.id)) {
            const data = speakerModalCache.get(room.id);
            // Populate form from cache
            ['speaker_1', 'speaker_2'].forEach(speakerKey => {
                const config = data[speakerKey] || data;
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_placement_type"]`).value = config[`${speakerKey}_placement_type`] || 'absolute';
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_x"]`).value = config[`${speakerKey}_x`] || '0';
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_y"]`).value = config[`${speakerKey}_y`] || '0';
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_z"]`).value = config[`${speakerKey}_z`] || '0';
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_furniture_name"]`).value = config[`${speakerKey}_furniture_name`] || '';
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_side"]`).value = config[`${speakerKey}_side`] || 'any';
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_max_distance"]`).value = config[`${speakerKey}_max_distance`] || '0.3';
                
                const placementSelect = setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_placement_type"]`);
                placementSelect.dispatchEvent(new Event('change'));
            });
        } else if (room.speakers_positions_config && Object.keys(room.speakers_positions_config).length > 0) {
            // Populate from the room's saved config
            ['speaker_1', 'speaker_2'].forEach(speakerKey => {
                const config = room.speakers_positions_config[speakerKey];
                if (config) {
                    setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_placement_type"]`).value = config.placement_type;
                    
                    if (config.placement_type === 'absolute') {
                        setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_x"]`).value = config.x || '0';
                        setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_y"]`).value = config.y || '0';
                        setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_z"]`).value = config.z || '0';
                    } else { // relative
                        setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_furniture_name"]`).value = config.furniture_name || '';
                        setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_side"]`).value = config.side || 'any';
                        setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_max_distance"]`).value = config.max_distance || '0.3';
                    }
                }
                const placementSelect = setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_placement_type"]`);
                placementSelect.dispatchEvent(new Event('change'));
            });
            // Prime the cache with the saved config
            const formData = new FormData(setSpeakerPositionsForm);
            const initialData = Object.fromEntries(formData.entries());
            delete initialData.room_id;
            speakerModalCache.set(room.id, initialData);
        } else {
            // Populate from room object for the first time (legacy or new room)
            ['speaker_1', 'speaker_2'].forEach(speakerKey => {
                const pos = room.speakers_positions[speakerKey];
                
                // Set absolute params - pos is an array [x, y, z] due to the custom JSON encoder
                if (pos && Array.isArray(pos) && pos.length === 3) {
                    setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_x"]`).value = Number(pos[0]).toFixed(2);
                    setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_y"]`).value = Number(pos[1]).toFixed(2);
                    setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_z"]`).value = Number(pos[2]).toFixed(2);
                } else {
                    setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_x"]`).value = '0.00';
                    setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_y"]`).value = '0.00';
                    setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_z"]`).value = '0.00';
                }

                // Set relative params to defaults
                const furnitureSelect = setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_furniture_name"]`);
                if (furnitureSelect.options.length > 0) {
                    furnitureSelect.selectedIndex = 0;
                }
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_side"]`).value = 'any';
                setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_max_distance"]`).value = '0.3';

                // Set placement type
                const placementSelect = setSpeakerPositionsForm.querySelector(`[name="${speakerKey}_placement_type"]`);
                placementSelect.value = 'absolute';
                placementSelect.dispatchEvent(new Event('change'));
            });
            
            // Save this initial state to cache
            const formData = new FormData(setSpeakerPositionsForm);
            const initialData = Object.fromEntries(formData.entries());
            delete initialData.room_id;
            speakerModalCache.set(room.id, initialData);
        }
    
        setSpeakerPositionsModal.classList.remove('hidden');
    };

    const closeSpeakerPositionsModal = () => {
        setSpeakerPositionsModal.classList.add('hidden');
    };

    closeSpeakerModalBtn.addEventListener('click', closeSpeakerPositionsModal);
    setSpeakerPositionsModal.addEventListener('click', (event) => {
        if (event.target === setSpeakerPositionsModal) {
            closeSpeakerPositionsModal();
        }
    });

    setSpeakerPositionsForm.addEventListener('input', () => {
        const roomId = speakerRoomIdInput.value;
        if (!roomId) return;
        const formData = new FormData(setSpeakerPositionsForm);
        const data = Object.fromEntries(formData.entries());
        delete data.room_id;
        speakerModalCache.set(roomId, data);
    });

    setSpeakerPositionsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(setSpeakerPositionsForm);
        const roomId = formData.get('room_id');
        const data = {};

        ['speaker_1', 'speaker_2'].forEach(speakerKey => {
            const placementType = formData.get(`${speakerKey}_placement_type`);
            data[speakerKey] = { placement_type: placementType };

            if (placementType === 'absolute') {
                data[speakerKey].x = formData.get(`${speakerKey}_x`);
                data[speakerKey].y = formData.get(`${speakerKey}_y`);
                data[speakerKey].z = formData.get(`${speakerKey}_z`);
            } else {
                data[speakerKey].furniture_name = formData.get(`${speakerKey}_furniture_name`);
                data[speakerKey].side = formData.get(`${speakerKey}_side`);
                data[speakerKey].max_distance = formData.get(`${speakerKey}_max_distance`);
            }
        });

        fetch(`/api/rooms/${roomId}/speaker-positions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(() => {
            closeSpeakerPositionsModal();
            speakerModalCache.delete(roomId);
            fetchRooms();
        })
        .catch(error => {
            console.error('Error setting speaker positions:', error);
            alert(`Error setting speaker positions: ${error.message}`);
        });
    });


    // --- Mic Position Modal Logic ---
    const setMicPositionModal = document.getElementById('set-mic-position-modal');
    const closeMicModalBtn = document.getElementById('close-mic-modal-btn');
    const setMicPositionForm = document.getElementById('set-mic-position-form');
    const micModalRoomName = document.getElementById('mic-modal-room-name');
    const micRoomIdInput = document.getElementById('mic-room-id');
    const micPositionSelect = document.getElementById('mic-position');
    const customMicPositionParams = document.getElementById('custom-mic-position-params');

    micPositionSelect.addEventListener('change', () => {
        if (micPositionSelect.value === 'custom') {
            customMicPositionParams.classList.remove('hidden');
        } else {
            customMicPositionParams.classList.add('hidden');
        }
    });

    const openMicPositionModal = (roomId, roomName, currentMicPosition) => {
        micModalRoomName.textContent = roomName;
        micRoomIdInput.value = roomId;
        setMicPositionForm.reset();

        // Set the current mic position in the select dropdown
        if (currentMicPosition) {
            // The mic_position from the backend is uppercase (e.g., 'CEILING_CENTERED')
            // but the select options have lowercase values (e.g., 'ceiling_centered')
            micPositionSelect.value = currentMicPosition.toLowerCase();
        }
        micPositionSelect.dispatchEvent(new Event('change')); // Trigger change to show/hide custom fields
        setMicPositionModal.classList.remove('hidden');
    };

    const closeMicPositionModal = () => {
        setMicPositionModal.classList.add('hidden');
    };

    closeMicModalBtn.addEventListener('click', closeMicPositionModal);
    setMicPositionModal.addEventListener('click', (event) => {
        if (event.target === setMicPositionModal) {
            closeMicPositionModal();
        }
    });

    setMicPositionForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(setMicPositionForm);
        const data = Object.fromEntries(formData.entries());
        const roomId = data.room_id;

        fetch(`/api/rooms/${roomId}/mic-position`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error) });
            return response.json();
        })
        .then(() => {
            closeMicPositionModal();
            fetchRooms(); // Refresh the list to show the updated mic position
        })
        .catch(error => alert(`Error setting mic position: ${error.message}`));
    });

    // --- Room Image Modal Logic ---
    const roomImageModal = document.getElementById('room-image-modal');
    const zoomedRoomImage = document.getElementById('zoomed-room-image');
    const closeRoomImageModalBtn = document.getElementById('close-room-image-modal-btn');

    const openRoomImageModal = (imageUrl) => {
        zoomedRoomImage.src = imageUrl;
        roomImageModal.classList.remove('hidden');
    };

    const closeRoomImageModal = () => {
        roomImageModal.classList.add('hidden');
        zoomedRoomImage.src = ''; // Clear src to stop loading
    };

    closeRoomImageModalBtn.addEventListener('click', closeRoomImageModal);
    roomImageModal.addEventListener('click', (event) => {
        if (event.target === roomImageModal) {
            closeRoomImageModal();
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


    // --- Audio Config Logic ---
    const saveAudioConfig = () => {
        const config = {
            ray_tracing: rayTracing.checked,
            air_absorption: airAbsorption.checked,
        };
        localStorage.setItem('audioConfig', JSON.stringify(config));
    };

    const loadAudioConfig = () => {
        const savedConfig = localStorage.getItem('audioConfig');
        if (savedConfig) {
            const config = JSON.parse(savedConfig);
            rayTracing.checked = config.ray_tracing !== false; // default to true
            airAbsorption.checked = config.air_absorption !== false; // default to true
        }
    };

    rayTracing.addEventListener('change', saveAudioConfig);
    airAbsorption.addEventListener('change', saveAudioConfig);


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
                
                roomsCache.clear();

                const availableRoomsHeader = document.getElementById('available-rooms-header');
                if (availableRoomsHeader) {
                    availableRoomsHeader.textContent = `Available Rooms (${rooms.length})`;
                }

                if (rooms.length === 0) {
                    roomsList.innerHTML = '<p class="text-gray-400">No rooms created yet.</p>';
                    return;
                }
                rooms.forEach(room => {
                    roomsCache.set(room.id, room);
                    const roomDiv = document.createElement('div');
                    roomDiv.className = 'bg-gray-700 p-4 rounded-md';

                    const roomHeader = document.createElement('h4');
                    roomHeader.className = 'font-bold cursor-pointer flex justify-between items-center';
                    roomHeader.innerHTML = `
                        <span>${room.name}</span>
                        <div class="flex items-center space-x-2">
                            <button title="Speakers" class="set-speakers-btn text-yellow-400 hover:text-yellow-600 p-2" data-id="${room.id}"><i class="fas fa-users pointer-events-none"></i></button>
                            <button title="Mic" class="set-mic-btn text-cyan-400 hover:text-cyan-600 p-2" data-id="${room.id}" data-name="${room.name}" data-mic-position="${room.mic_position}"><i class="fas fa-microphone pointer-events-none"></i></button>
                            <button title="+ Furniture" class="add-furniture-btn text-blue-400 hover:text-blue-600 p-2" data-id="${room.id}" data-name="${room.name}"><i class="fas fa-plus pointer-events-none"></i></button>
                            <button title="Delete" class="delete-room-btn text-red-500 hover:text-red-700 p-2" data-id="${room.id}"><i class="fas fa-trash pointer-events-none"></i></button>
                        </div>
                    `;

                    const roomContent = document.createElement('div');
                    roomContent.className = 'collapsible-content'; // Initially expanded
                    const timestamp = new Date().getTime(); // Cache-busting timestamp
                    roomContent.innerHTML = `
                        <img src="/api/rooms/${room.id}/image?t=${timestamp}" alt="Room layout for ${room.name}" class="my-2 rounded-md cursor-zoom-in">
                        <details class="mt-2 text-xs">
                            <summary class="cursor-pointer">Details</summary>
                            <pre class="mt-2 p-2 bg-gray-800 rounded text-gray-300 text-xs">${JSON.stringify(room, null, 2)}</pre>
                        </details>
                    `;

                    roomContent.querySelector('img').addEventListener('click', (e) => {
                        const baseUrl = e.target.src.split('?')[0];
                        const newTimestamp = new Date().getTime();
                        const highResUrl = `${baseUrl}?width=1024&height=1024&t=${newTimestamp}`;
                        openRoomImageModal(highResUrl);
                    });

                    roomHeader.querySelector('.set-speakers-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        const roomId = e.target.getAttribute('data-id');
                        const room = roomsCache.get(roomId);
                        if (room) {
                            openSpeakerPositionsModal(room);
                        }
                    });

                    roomHeader.querySelector('.set-mic-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        const roomId = e.target.getAttribute('data-id');
                        const roomName = e.target.getAttribute('data-name');
                        const micPosition = e.target.getAttribute('data-mic-position');
                        openMicPositionModal(roomId, roomName, micPosition);
                    });

                    roomHeader.querySelector('.add-furniture-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        const roomId = e.target.getAttribute('data-id');
                        const roomName = e.target.getAttribute('data-name');
                        openFurnitureModal(roomId, roomName);
                    });

                    roomHeader.querySelector('.delete-room-btn').addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent the collapse toggle
                        const roomId = e.target.getAttribute('data-id');
                        if (confirm(`Are you sure you want to delete room "${room.name}"?`)) {
                            fetch(`/api/rooms/${roomId}`, { method: 'DELETE' })
                                .then(response => {
                                    if (!response.ok) throw new Error('Failed to delete room');
                                    speakerModalCache.delete(roomId);
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
                audio_config: {
                    background_effect: backgroundEffect.value,
                    foreground_effect: foregroundEffect.value,
                    foreground_effect_position: foregroundEffectPosition.value,
                    source_volumes: {
                        ROOM: sourceVolumeRoom.value,
                        BACKGROUND: sourceVolumeBackground.value
                    },
                    kwargs_pyroom: {
                        ray_tracing: rayTracing.checked,
                        air_absorption: airAbsorption.checked
                    }
                }
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
    loadAudioConfig();
});
