<%+
local uci = require "uci"
-%>
<style>
.secret-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 4px;
}
.secret-item input[type="text"] {
    flex: 1;
}
.secret-name {
    min-width: 150px;
}
</style>

<div class="secret-list">
<% for i, section in ipairs(self:sections()) do %>
	<div class="secret-item">
		<span class="secret-name"><%= translate("User") %> <%= i %>:</span>
		<input type="text" name=".<%=section%>.name" value="<%=i %>" />
		<input type="text" name=".<%=section%>.value" placeholder="0123456789abcdef..." style="flex: 2;" />
		<button type="button" class="btn remove-button" onclick="this.closest('.secret-item').remove()">✕</button>
	</div>
<% end %> 
</div>

<button type="button" class="btn cbi-button-add" onclick="addSecretRow()">+ <%= translate("Add User") %></button>

<script>
function addSecretRow() {
    const list = document.querySelector('.secret-list');
    const index = Math.floor(Date.now() / 1000);
    const div = document.createElement('div');
    div.className = 'secret-item';
    div.innerHTML = `
        <span class="secret-name"><%= translate("User") %> ${index}:</span>
        <input type="text" name=".${index}.name" value="${index}" />
        <input type="text" name=".${index}.value" placeholder="0123456789abcdef..." style="flex: 2;" />
        <button type="button" class="btn remove-button" onclick="this.closest('.secret-item').remove()">✕</button>
    `;
    list.appendChild(div);
}
</script>
