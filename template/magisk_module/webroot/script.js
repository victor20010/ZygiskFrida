document.addEventListener('DOMContentLoaded', () => {
    // Tab navigation
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;

            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Config Tab Elements
    const loadConfigBtn = document.getElementById('loadConfigBtn');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const exportConfigBtn = document.getElementById('exportConfigBtn');
    const importConfigBtn = document.getElementById('importConfigBtn');
    const importConfigFileInput = document.getElementById('importConfigFile');

    const targetsListDiv = document.getElementById('targetsList');
    const statusBar = document.getElementById('statusBar').querySelector('p');

    const formTitle = document.getElementById('formTitle');
    const editingTargetIndexInput = document.getElementById('editingTargetIndex');
    const appNameInput = document.getElementById('app_name');
    const openAppPickerBtn = document.getElementById('openAppPickerBtn');
    const enabledCheckbox = document.getElementById('enabled_chk');
    const startupDelayInput = document.getElementById('start_up_delay_ms');
    
    const availableLibsSelect = document.getElementById('available_libs');
    const addSelectedLibBtn = document.getElementById('addSelectedLibBtn');
    const currentInjectedLibsListDiv = document.getElementById('currentInjectedLibsList');
    const gadgetHelperMessagesDiv = document.getElementById('gadgetHelperMessages');
    const toggleManualEditLibsBtn = document.getElementById('toggleManualEditLibsBtn');
    const injectedLibrariesTextarea = document.getElementById('injected_libraries_json');
    
    const childGatingEnabledCheckbox = document.getElementById('child_gating_enabled_chk');
    const childGatingModeSelect = document.getElementById('child_gating_mode');
    const childGatingInjectedLibrariesTextarea = document.getElementById('child_gating_injected_libraries_json');
    
    const submitTargetBtn = document.getElementById('submitTargetBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    const appPickerModal = document.getElementById('appPickerModal');
    const closeAppPickerModalBtn = document.getElementById('closeAppPickerModalBtn');
    const appSearchInput = document.getElementById('appSearchInput');
    const appListContainer = document.getElementById('appListContainer');
    let allInstalledApps = [];

    // Logcat Tab Elements
    const refreshLogcatBtn = document.getElementById('refreshLogcatBtn');
    const clearLogcatBtn = document.getElementById('clearLogcatBtn');
    const logcatOutputPre = document.getElementById('logcatOutput');

    const BASE_PATH = '/data/local/tmp/re.zyg.fri';
    const CONFIG_PATH = `${BASE_PATH}/config.json`;
    const CONFIG_EXAMPLE_PATH = `${BASE_PATH}/config.json.example`;
    const LIBS_SUBFOLDER = 'libs'; 

    let currentConfig = { targets: [] };
    let execCounter = 0;
    let configDirty = false;

    async function execShellCommand(command) {
        console.log(`Executing: ${command}`);
        return new Promise((resolve, reject) => {
            if (typeof ksu !== 'undefined' && ksu.exec) {
                const callbackName = `exec_callback_${Date.now()}_${execCounter++}`;
                window[callbackName] = (errno, stdout, stderr) => {
                    delete window[callbackName];
                    if (errno === 0) resolve(stdout);
                    else { console.error(`Cmd failed: ${command}\nStderr: ${stderr}\nErrno: ${errno}`); reject(new Error(stderr || `Cmd failed with errno ${errno}`)); }
                };
                try { ksu.exec(command, '{}', callbackName); }
                catch (e) { reject(new Error('Failed to initiate ksu.exec: ' + e.message));}
            } else {
                console.warn('execShellCommand: ksu или другой мост не найден. Используется заглушка.');
                if (command.startsWith('cat')) {
                    const path = command.split(' ')[1];
                    const stored = localStorage.getItem(path);
                    if (stored) resolve(stored);
                    else if (path === CONFIG_PATH && localStorage.getItem(CONFIG_EXAMPLE_PATH)) resolve(localStorage.getItem(CONFIG_EXAMPLE_PATH));
                    else resolve("");
                } else if (command.startsWith('echo')) {
                    const path = command.split('>')[1].trim();
                    const contentMatch = command.match(/'(.*?)'/);
                    if (contentMatch && contentMatch[1]) localStorage.setItem(path, contentMatch[1]);
                    resolve('');
                } else if (command.startsWith('mkdir') || command.startsWith('find')) {
                    if (command.includes(".so")) resolve(`${BASE_PATH}/libgadget.so\n${BASE_PATH}/libcustom.so\n${BASE_PATH}/${LIBS_SUBFOLDER}/another.so\n${BASE_PATH}/libgadget-child.so`);
                    else resolve('');
                } else if (command.startsWith('pm list packages -3')) {
                    resolve("package:com.example.app1\npackage:com.example.app2\npackage:org.my.testapp");
                } else if (command.startsWith('logcat -d -s ZygiskFrida')) {
                    resolve(`05-21 14:50:00.123 I ZygiskFrida (1234): Module loaded successfully.\n05-21 14:50:01.456 D ZygiskFrida (1234): Injecting into com.example.app1\n05-21 14:50:02.789 W ZygiskFrida (1234): Gadget config not found for libgadget.so, using defaults.`);
                } else if (command.startsWith('test -f')) { 
                    const match = command.match(/test -f "([^"]+)"/);
                    if (match && match[1]) {
                        const filePath = match[1];
                        if (filePath.includes('libgadget.so') || filePath.includes('libcustom.so') || filePath.includes('libgadget-child.so') || filePath.endsWith('.config.so')) {
                            resolve('exists');
                        } else {
                            resolve('not_exists');
                        }
                    } else {
                        console.warn("Mock 'test -f' could not parse filePath from command:", command);
                        resolve('not_exists'); 
                    }
                }
                else reject(new Error('execShellCommand: Unknown command for mock.'));
            }
        });
    }
    
    function updateStatus(message, type = 'info') {
        statusBar.textContent = `Статус: ${message}`;
        if (type === 'error') statusBar.style.color = 'var(--danger-color)';
        else if (type === 'warning') statusBar.style.color = 'var(--warning-color)';
        else statusBar.style.color = 'var(--text-primary-color)';
        if (type === 'warning' || type === 'error') {
            statusBar.classList.add('status-attention');
            setTimeout(() => statusBar.classList.remove('status-attention'), 500);
        }
    }
    
    function setConfigDirty(isDirty = true) {
        configDirty = isDirty;
        if (isDirty) {
            updateStatus('Есть несохраненные изменения. Нажмите "Сохранить".', 'warning');
        }
    }

    async function checkFileExists(filePath) {
        try {
            const result = await execShellCommand(`test -f "${filePath}" && echo "exists" || echo "not_exists"`);
            return result.trim() === "exists";
        } catch (e) {
            console.warn(`Could not check existence of ${filePath}:`, e);
            return false; 
        }
    }

    async function loadAvailableFiles(selectElement, path, subfolder, extension) {
        selectElement.innerHTML = `<option value="">-- Загрузка ${extension} файлов... --</option>`;
        try {
            let findCommands = [`find ${path} -maxdepth 1 -name '*.${extension}' -type f`];
            if (subfolder) findCommands.push(`find ${path}/${subfolder} -maxdepth 1 -name '*.${extension}' -type f`);
            
            let files = [];
            for (const cmd of findCommands) {
                try {
                    const result = await execShellCommand(cmd);
                    if (result.trim()) files = files.concat(result.trim().split('\n'));
                } catch (e) { console.warn(`Could not list files with cmd "${cmd}":`, e.message); }
            }
            files = [...new Set(files)].filter(f => f.trim() !== '');

            selectElement.innerHTML = `<option value="">-- Выберите ${extension} файл --</option>`;
            if (files.length > 0) {
                files.forEach(file => {
                    const option = document.createElement('option');
                    option.value = file;
                    let displayName = file;
                    if (file.startsWith(`${BASE_PATH}/${LIBS_SUBFOLDER}/`)) displayName = `${LIBS_SUBFOLDER}/${file.substring(`${BASE_PATH}/${LIBS_SUBFOLDER}/`.length)}`;
                    else if (file.startsWith(`${BASE_PATH}/`)) displayName = file.substring(`${BASE_PATH}/`.length);
                    option.textContent = displayName;
                    selectElement.appendChild(option);
                });
            } else selectElement.innerHTML = `<option value="">-- .${extension} файлы не найдены --</option>`;
        } catch (error) { console.error(`Ошибка загрузки .${extension} файлов:`, error); selectElement.innerHTML = `<option value="">-- Ошибка загрузки ${extension} --</option>`;}
    }

    async function loadConfiguration(configToLoad = null) {
        updateStatus('Загрузка конфигурации...');
        await resetForm(); // Await resetForm as it's now async
        await loadAvailableFiles(availableLibsSelect, BASE_PATH, LIBS_SUBFOLDER, 'so'); // Await this

        if (configToLoad) { 
            currentConfig = configToLoad;
            if (!currentConfig.targets) currentConfig.targets = [];
            updateStatus('Конфигурация импортирована. Проверьте и сохраните.', 'warning');
            setConfigDirty(true);
        } else { 
            try {
                await execShellCommand(`mkdir -p ${BASE_PATH}/`);
                if (LIBS_SUBFOLDER) await execShellCommand(`mkdir -p ${BASE_PATH}/${LIBS_SUBFOLDER}/`);

                let rawConfig;
                try { rawConfig = await execShellCommand(`cat ${CONFIG_PATH}`); }
                catch (e) { rawConfig = ""; updateStatus(`Файл ${CONFIG_PATH} не найден.`, 'warning'); }

                if (!rawConfig || rawConfig.trim() === '') {
                    updateStatus(`Конфигурация пуста. Попытка загрузить ${CONFIG_EXAMPLE_PATH}...`, 'warning');
                    try {
                        const exampleConfig = await execShellCommand(`cat ${CONFIG_EXAMPLE_PATH}`);
                        if (exampleConfig && exampleConfig.trim() !== '') currentConfig = JSON.parse(exampleConfig);
                        else throw new Error("Пример пуст");
                        updateStatus('Загружен пример конфигурации. Сохраните, чтобы использовать.', 'warning');
                        setConfigDirty(true); 
                    } catch (e) { currentConfig = { targets: [] }; updateStatus(`Пример ${CONFIG_EXAMPLE_PATH} не найден или пуст. Создана пустая конфигурация.`, 'warning'); }
                } else { currentConfig = JSON.parse(rawConfig); updateStatus('Конфигурация успешно загружена.'); }

                if (!currentConfig.targets) currentConfig.targets = [];
                 setConfigDirty(false); 
            } catch (error) {
                console.error('Ошибка загрузки конфигурации:', error);
                updateStatus(`Ошибка загрузки: ${error.message}`, 'error');
                targetsListDiv.innerHTML = '<p style="color: var(--danger-color);">Не удалось загрузить конфигурацию.</p>';
                currentConfig = { targets: [] }; 
                setConfigDirty(false);
            }
        }
        renderTargets();
        if (editingTargetIndexInput.value !== '-1' || (injectedLibrariesTextarea.value.trim() !== '[]' && injectedLibrariesTextarea.value.trim() !== '')) {
             await renderFileListInForm(currentInjectedLibsListDiv, injectedLibrariesTextarea, 'lib'); // Await this
        }
    }
    
    async function renderFileListInForm(listDivElement, textareaElement, fileType) { // Stays async
        listDivElement.innerHTML = '';
        gadgetHelperMessagesDiv.innerHTML = ''; 
        let hasGadgetNeedingConfig = false;

        try {
            const files = JSON.parse(textareaElement.value.trim() || '[]');
            if (Array.isArray(files) && files.length > 0) {
                for (const [index, fileObj] of files.entries()) { 
                    if (typeof fileObj === 'object' && fileObj.path) {
                        const itemDiv = document.createElement('div');
                        itemDiv.classList.add('file-item');
                        const fileName = fileObj.path.split('/').pop() || fileObj.path;
                        let itemHTML = `<span>${fileName}</span>`;

                        const fileExists = await checkFileExists(fileObj.path);
                        if (!fileExists) {
                            itemHTML += `<span class="file-warning-icon" title="Файл не найден по указанному пути!">&#9888;</span>`;
                        }

                        if (fileName.match(/libgadget(32|64|-child)?\.so/i)) {
                            const configSoPath = fileObj.path.replace(/\.so$/, '.config.so');
                            const configSoExists = await checkFileExists(configSoPath);
                            if (!configSoExists) {
                                hasGadgetNeedingConfig = true;
                                gadgetHelperMessagesDiv.innerHTML += `
                                    <p>Для <strong>${fileName}</strong> не найден файл конфигурации <code>${configSoPath.split('/').pop()}</code>.
                                    Он необходим, если вы хотите изменить порт гаджета или другие его настройки (особенно для <code>-child.so</code>).</p>
                                `;
                                if (fileName.includes('-child')) {
                                    gadgetHelperMessagesDiv.innerHTML += `
                                        <p>Пример содержимого для <code>${configSoPath.split('/').pop()}</code> (для другого порта):</p>
                                        <code>{\n  "interaction": {\n    "type": "listen",\n    "address": "127.0.0.1",\n    "port": 27043,\n    "on_port_conflict": "pick-next",\n    "on_load": "wait"\n  }\n}</code>
                                    `;
                                } else {
                                     gadgetHelperMessagesDiv.innerHTML += `
                                        <p>Стандартный гаджет слушает порт 27042. Если нужен другой, создайте <code>${configSoPath.split('/').pop()}</code>.</p>
                                     `;
                                }
                            }
                        }
                        
                        itemHTML += `<button type="button" class="remove-file-btn" data-index="${index}" data-type="${fileType}">Удалить</button>`;
                        itemDiv.innerHTML = itemHTML;
                        listDivElement.appendChild(itemDiv);
                    }
                }
                listDivElement.querySelectorAll('.remove-file-btn').forEach(btn => {
                    btn.addEventListener('click', handleRemoveFileFromForm);
                });
            } else {
                listDivElement.innerHTML = `<small>Нет ${fileType === 'lib' ? 'библиотек' : 'файлов'} в списке.</small>`;
            }
        } catch (e) {
            listDivElement.innerHTML = `<small style="color:var(--danger-color);">Ошибка JSON в списке ${fileType === 'lib' ? 'библиотек' : 'файлов'}.</small>`;
            console.error("Error parsing JSON for file list in form:", e);
        }
        gadgetHelperMessagesDiv.style.display = hasGadgetNeedingConfig ? 'block' : 'none';
    }


    async function handleRemoveFileFromForm(event) { // Make async
        const btn = event.target;
        const indexToRemove = parseInt(btn.dataset.index, 10);
        const fileType = btn.dataset.type; 
        const textarea = injectedLibrariesTextarea; 
        const listDiv = currentInjectedLibsListDiv; 

        try {
            let currentFiles = JSON.parse(textarea.value.trim() || '[]');
            if (Array.isArray(currentFiles) && indexToRemove >= 0 && indexToRemove < currentFiles.length) {
                currentFiles.splice(indexToRemove, 1);
                textarea.value = JSON.stringify(currentFiles, null, 2);
                await renderFileListInForm(listDiv, textarea, fileType); // Await
                setConfigDirty();
            }
        } catch (e) {
            alert("Ошибка при удалении файла: неверный JSON. Пожалуйста, исправьте вручную.");
            console.error("JSON parse error in handleRemoveFileFromForm:", e);
        }
    }
    
    async function toggleTextareaEdit(textareaElement, buttonElement, listDivElement, dynamicSelectorDiv) { // Make async
        const isReadOnly = textareaElement.readOnly;
        textareaElement.readOnly = !isReadOnly;
        buttonElement.textContent = isReadOnly ? "Скрыть JSON (управлять кнопками)" : "Редактировать JSON вручную";
        if (isReadOnly) { 
            listDivElement.style.display = 'none';
            gadgetHelperMessagesDiv.style.display = 'none';
            if (dynamicSelectorDiv) dynamicSelectorDiv.style.display = 'none';
        } else { 
            listDivElement.style.display = 'block';
            if (dynamicSelectorDiv) dynamicSelectorDiv.style.display = 'flex';
            await renderFileListInForm(listDivElement, textareaElement, 'lib'); // Await
        }
    }

    toggleManualEditLibsBtn.addEventListener('click', () => toggleTextareaEdit(injectedLibrariesTextarea, toggleManualEditLibsBtn, currentInjectedLibsListDiv, addSelectedLibBtn.closest('.dynamic-selector')));

    function renderTargets() {
        targetsListDiv.innerHTML = '';
        if (!currentConfig.targets || currentConfig.targets.length === 0) {
            targetsListDiv.innerHTML = '<p>Цели не настроены. Добавьте новую ниже.</p>';
            return;
        }

        currentConfig.targets.forEach((target, index) => {
            const item = document.createElement('div');
            item.classList.add('target-item');
            item.setAttribute('data-index', index);

            const librariesDisplay = target.injected_libraries && target.injected_libraries.length > 0 ?
                target.injected_libraries.map(lib => lib.path.split('/').pop() || 'N/A').join(', ') : "Не заданы";
            
            let childGatingDisplay = "Выключено";
            if (target.child_gating && target.child_gating.enabled) {
                childGatingDisplay = `Режим: ${target.child_gating.mode || 'N/A'}`;
                if (target.child_gating.injected_libraries && target.child_gating.injected_libraries.length > 0) {
                    childGatingDisplay += `; Либы CG: ${target.child_gating.injected_libraries.length}`;
                }
            }
            const targetEnabled = target.enabled === undefined ? true : target.enabled;

            item.innerHTML = `
                <div class="target-item-info">
                    <p><strong>Приложение:</strong> ${target.app_name || 'N/A'}</p>
                    <p><strong>Задержка:</strong> ${target.start_up_delay_ms === undefined ? 0 : target.start_up_delay_ms} мс</p>
                    <p class="lib-display"><strong>Инжект. библиотеки:</strong> ${librariesDisplay}</p>
                    <p class="child-gating-display"><strong>Child Gating:</strong> ${childGatingDisplay}</p>
                </div>
                <div class="target-item-toggle">
                    <label for="quickEnable_${index}">Вкл:</label>
                    <input type="checkbox" id="quickEnable_${index}" class="quick-enable-toggle" ${targetEnabled ? 'checked' : ''}>
                </div>
                <div class="target-actions">
                    <button type="button" class="edit-btn">Редактировать</button>
                    <button type="button" class="delete-btn">Удалить</button>
                </div>
            `;
            targetsListDiv.appendChild(item);
        });

        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', (e) => editTarget(e.target.closest('.target-item').dataset.index));
        });
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', (e) => deleteTarget(e.target.closest('.target-item').dataset.index));
        });
        document.querySelectorAll('.quick-enable-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const index = parseInt(e.target.closest('.target-item').dataset.index, 10);
                if (currentConfig.targets[index]) {
                    currentConfig.targets[index].enabled = e.target.checked;
                    setConfigDirty();
                }
            });
        });
    }

    async function resetForm() { // Make async
        formTitle.textContent = 'Добавить новую цель';
        editingTargetIndexInput.value = '-1';
        appNameInput.value = '';
        enabledCheckbox.checked = true;
        startupDelayInput.value = '0';
        
        injectedLibrariesTextarea.value = JSON.stringify([{ path: `${BASE_PATH}/libgadget.so` }], null, 2);
        injectedLibrariesTextarea.readOnly = true; toggleManualEditLibsBtn.textContent = "Редактировать JSON вручную";
        await renderFileListInForm(currentInjectedLibsListDiv, injectedLibrariesTextarea, 'lib'); // Await
        currentInjectedLibsListDiv.style.display = 'block'; addSelectedLibBtn.closest('.dynamic-selector').style.display = 'flex';
        gadgetHelperMessagesDiv.style.display = 'none';


        childGatingEnabledCheckbox.checked = false;
        childGatingModeSelect.value = 'freeze';
        childGatingInjectedLibrariesTextarea.value = JSON.stringify([{ path: `${BASE_PATH}/libgadget-child.so` }], null, 2);
        
        submitTargetBtn.textContent = 'Добавить цель';
        cancelEditBtn.style.display = 'none';
        availableLibsSelect.value = ""; 
        appNameInput.focus();
    }

    async function editTarget(indexStr) { // Make async
        const index = parseInt(indexStr, 10);
        const target = currentConfig.targets[index];
        if (!target) return;

        tabLinks.forEach(l => l.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        document.querySelector('.tab-link[data-tab="configTab"]').classList.add('active');
        document.getElementById('configTab').classList.add('active');

        formTitle.textContent = 'Редактировать цель';
        editingTargetIndexInput.value = index;
        appNameInput.value = target.app_name || '';
        enabledCheckbox.checked = target.enabled === undefined ? true : target.enabled;
        startupDelayInput.value = target.start_up_delay_ms === undefined ? '0' : String(target.start_up_delay_ms);
        
        injectedLibrariesTextarea.value = JSON.stringify(target.injected_libraries || [{ path: `${BASE_PATH}/libgadget.so` }], null, 2);
        injectedLibrariesTextarea.readOnly = true; toggleManualEditLibsBtn.textContent = "Редактировать JSON вручную";
        await renderFileListInForm(currentInjectedLibsListDiv, injectedLibrariesTextarea, 'lib'); // Await
        currentInjectedLibsListDiv.style.display = 'block'; addSelectedLibBtn.closest('.dynamic-selector').style.display = 'flex';

        if (target.child_gating) {
            childGatingEnabledCheckbox.checked = target.child_gating.enabled || false;
            childGatingModeSelect.value = target.child_gating.mode || 'freeze';
            childGatingInjectedLibrariesTextarea.value = JSON.stringify(target.child_gating.injected_libraries || [], null, 2);
        } else {
            childGatingEnabledCheckbox.checked = false;
            childGatingModeSelect.value = 'freeze';
            childGatingInjectedLibrariesTextarea.value = JSON.stringify([], null, 2);
        }
        
        submitTargetBtn.textContent = 'Обновить цель';
        cancelEditBtn.style.display = 'inline-block';
        availableLibsSelect.value = ""; 
        document.querySelector('.target-form-container').scrollIntoView({ behavior: 'smooth' });
    }

    function deleteTarget(indexStr) {
        const index = parseInt(indexStr, 10);
        if (confirm(`Вы уверены, что хотите удалить цель: ${currentConfig.targets[index].app_name}?`)) {
            currentConfig.targets.splice(index, 1);
            renderTargets();
            setConfigDirty();
        }
    }

    async function addFileToTextareaInternal(textareaElement, listDivElement, filePath, fileType) { 
        if (!filePath) return;
        try {
            let currentFiles = JSON.parse(textareaElement.value.trim() || '[]');
            if (!Array.isArray(currentFiles)) currentFiles = [];
            if (!currentFiles.some(f => f.path === filePath)) {
                currentFiles.push({ path: filePath });
                textareaElement.value = JSON.stringify(currentFiles, null, 2);
                await renderFileListInForm(listDivElement, textareaElement, fileType); 
                setConfigDirty();
            } else {
                alert("Этот файл уже добавлен.");
            }
        } catch (e) { alert("Ошибка при добавлении файла: неверный JSON. Пожалуйста, исправьте."); console.error("JSON parse error:", e); }
    }
    
    addSelectedLibBtn.addEventListener('click', () => addFileToTextareaInternal(injectedLibrariesTextarea, currentInjectedLibsListDiv, availableLibsSelect.value, 'lib'));

    async function handleSubmitTarget(event) { 
        event.preventDefault();
        const appName = appNameInput.value.trim();
        if (!appName) { alert('Имя приложения (Package ID) обязательно.'); appNameInput.focus(); return; }

        let injectedLibraries, childGatingInjectedLibraries;
        let allLibsExist = true;
        try {
            injectedLibraries = JSON.parse(injectedLibrariesTextarea.value.trim() || '[]');
            if (!Array.isArray(injectedLibraries) || !injectedLibraries.every(lib => typeof lib === 'object' && typeof lib.path === 'string')) throw new Error("Инжект. библиотеки: неверный формат.");
            
            for (const lib of injectedLibraries) { 
                if (!(await checkFileExists(lib.path))) {
                    allLibsExist = false;
                }
            }

            childGatingInjectedLibraries = JSON.parse(childGatingInjectedLibrariesTextarea.value.trim() || '[]');
             if (!Array.isArray(childGatingInjectedLibraries) || !childGatingInjectedLibraries.every(lib => typeof lib === 'object' && typeof lib.path === 'string')) throw new Error("Библиотеки Child Gating: неверный формат.");
        } catch (e) { alert(`Ошибка в JSON данных: ${e.message}`); return; }

        const targetData = {
            app_name: appName,
            enabled: enabledCheckbox.checked,
            start_up_delay_ms: parseInt(startupDelayInput.value, 10) || 0,
            injected_libraries: injectedLibraries,
            child_gating: {
                enabled: childGatingEnabledCheckbox.checked,
                mode: childGatingModeSelect.value,
                injected_libraries: childGatingInjectedLibraries
            }
        };

        const editingIndex = parseInt(editingTargetIndexInput.value, 10);
        if (editingIndex > -1 && currentConfig.targets[editingIndex]) currentConfig.targets[editingIndex] = targetData;
        else currentConfig.targets.push(targetData);
        
        renderTargets();
        await renderFileListInForm(currentInjectedLibsListDiv, injectedLibrariesTextarea, 'lib'); 
        
        if (editingTargetIndexInput.value === '-1') { 
            await resetForm(); // Await
        }
        
        setConfigDirty();
        if (!allLibsExist) {
            updateStatus('Цель сохранена, но некоторые пути к библиотекам не существуют. Проверьте!', 'warning');
        } else {
            updateStatus('Изменения внесены (локально). Нажмите "Сохранить ВСЕ изменения", чтобы применить.', 'warning');
        }
    }

    async function saveConfigurationToDevice() {
        if (!currentConfig || !currentConfig.targets) { updateStatus('Нет данных для сохранения.', 'error'); return; }
        
        let allPathsValid = true;
        for (const target of currentConfig.targets) {
            if (target.injected_libraries) {
                for (const lib of target.injected_libraries) {
                    if (!(await checkFileExists(lib.path))) {
                        allPathsValid = false;
                        break;
                    }
                }
            }
            if (!allPathsValid) break;
        }

        if (!allPathsValid) {
            if (!confirm("Внимание! Некоторые пути к библиотекам в конфигурации не существуют на устройстве. Все равно сохранить?")) {
                updateStatus("Сохранение отменено из-за неверных путей.", "warning");
                return;
            }
        }
        
        updateStatus('Сохранение конфигурации на устройство...');
        try {
            const configString = JSON.stringify(currentConfig, null, 4);
            const escapedConfigString = configString.replace(/'/g, "'\\''"); 
            await execShellCommand(`echo '${escapedConfigString}' > ${CONFIG_PATH}`);
            updateStatus('Конфигурация успешно сохранена на устройстве.');
            setConfigDirty(false);
        } catch (error) { console.error('Ошибка сохранения:', error); updateStatus(`Ошибка сохранения: ${error.message}`, 'error'); }
    }

    async function loadInstalledApps() {
        appListContainer.innerHTML = '<p>Загрузка списка приложений...</p>';
        try {
            const result = await execShellCommand('pm list packages -3');
            allInstalledApps = result.trim().split('\n')
                .map(line => line.replace('package:', '').trim())
                .filter(pkgName => pkgName) 
                .sort();
            renderAppList(allInstalledApps);
        } catch (error) {
            console.error("Ошибка загрузки списка приложений:", error);
            appListContainer.innerHTML = '<p style="color:var(--danger-color);">Не удалось загрузить список приложений.</p>';
        }
    }

    function renderAppList(appsToRender) {
        appListContainer.innerHTML = '';
        if (appsToRender.length === 0) {
            appListContainer.innerHTML = '<p>Приложения не найдены или фильтр слишком строгий.</p>';
            return;
        }
        appsToRender.forEach(pkgName => {
            const appDiv = document.createElement('div');
            appDiv.classList.add('app-item');
            appDiv.textContent = pkgName;
            appDiv.addEventListener('click', () => {
                appNameInput.value = pkgName;
                appPickerModal.style.display = 'none';
                appSearchInput.value = ''; 
            });
            appListContainer.appendChild(appDiv);
        });
    }

    openAppPickerBtn.addEventListener('click', () => {
        appPickerModal.style.display = 'block';
        if (allInstalledApps.length === 0) loadInstalledApps();
        else renderAppList(allInstalledApps); 
        appSearchInput.focus();
    });

    closeAppPickerModalBtn.addEventListener('click', () => appPickerModal.style.display = 'none');
    appSearchInput.addEventListener('input', (e) => renderAppList(allInstalledApps.filter(pkgName => pkgName.toLowerCase().includes(e.target.value.toLowerCase()))));
    window.addEventListener('click', (event) => { if (event.target === appPickerModal) appPickerModal.style.display = 'none'; });

    exportConfigBtn.addEventListener('click', () => {
        if (!currentConfig || !currentConfig.targets) { alert('Нет конфигурации для экспорта.'); return; }
        const configString = JSON.stringify(currentConfig, null, 4);
        const blob = new Blob([configString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ZygiskFrida_config_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        updateStatus('Конфигурация экспортирована.');
    });

    importConfigBtn.addEventListener('click', () => importConfigFileInput.click());
    importConfigFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => { // Make async to await loadConfiguration
                try {
                    const importedConfig = JSON.parse(e.target.result);
                    if (importedConfig && typeof importedConfig === 'object') {
                        if (confirm("Вы уверены, что хотите импортировать эту конфигурацию? Текущие несохраненные изменения будут потеряны.")) {
                           await loadConfiguration(importedConfig); // Await this
                        }
                    } else throw new Error("Файл не содержит корректный JSON объект.");
                } catch (error) { alert(`Ошибка импорта конфигурации: ${error.message}`); console.error("Ошибка импорта:", error);
                } finally { importConfigFileInput.value = ''; }
            };
            reader.readAsText(file);
        }
    });

    async function fetchAndDisplayLogcat() {
        logcatOutputPre.textContent = 'Загрузка логов...';
        try {
            const logs = await execShellCommand('logcat -d -s ZygiskFrida');
            logcatOutputPre.textContent = logs.trim() || 'Логи для ZygiskFrida отсутствуют или пусты.';
            updateStatus('Логи обновлены.', 'info');
        } catch (error) {
            logcatOutputPre.textContent = `Ошибка загрузки логов: ${error.message}`;
            updateStatus('Ошибка загрузки логов.', 'error');
        }
    }
    refreshLogcatBtn.addEventListener('click', fetchAndDisplayLogcat);
    clearLogcatBtn.addEventListener('click', () => {
        logcatOutputPre.textContent = 'Логи очищены. Нажмите "Обновить логи" для просмотра.';
        updateStatus('Логи очищены.', 'info');
    });

    loadConfigBtn.addEventListener('click', () => loadConfiguration()); 
    saveConfigBtn.addEventListener('click', saveConfigurationToDevice);
    submitTargetBtn.addEventListener('click', handleSubmitTarget);
    cancelEditBtn.addEventListener('click', resetForm); // resetForm is now async, but it's fine in a sync event handler

    // Initial load
    loadConfiguration();
});
