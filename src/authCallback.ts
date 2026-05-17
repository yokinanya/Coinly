setStatus("授权已完成，可以关闭此窗口。");

function setStatus(message: string): void {
  const element = document.getElementById("status");
  if (element) element.textContent = message;
}
