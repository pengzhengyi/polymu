import random
import typing

data_filename = 'python-packages-data.txt'
template_filename = 'python-packages-template.html'
num_packages = 299594

def get_data():
  reader = open(data_filename, 'r')
  for line in reader:
    yield line
  reader.close()


def sample_data(k: int):
  indices = set(random.sample(range(num_packages), k))
  reader = open(data_filename, 'r')
  for index, line in enumerate(reader):
    if index in indices:
      yield line
  reader.close()


def generate_page(filename: str, k: int = None):
  with open(template_filename, 'r') as reference:
    with open(filename, 'w') as writer:
      for line in reference:
        if 'DATA' in line:
          if k is None:
            writer.writelines(get_data())
          else:
            writer.writelines(sample_data(k))
        else:
          writer.write(line)


# generate_page('python-packages-2000.html', k=2000)
# generate_page('python-packages-full.html')